import json
import logging
from collections import defaultdict
from pathlib import Path
from typing import Optional, Dict, Any

log = logging.getLogger(__name__)

# ---------------------------
# CONFIG
# ---------------------------

LEARN_THRESHOLD = 3   # learn after 3 occurrences

# ---------------------------
# IN-MEMORY STORE
# ---------------------------

merchant_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
    "count": 0,
    "label": None,
    "category": None
})

# ---------------------------
# PERSISTENCE (JSON file, same pattern as feature_classifier)
# ---------------------------

def _stats_path() -> Path:
    from app.config import settings
    return Path(settings.LEARNING_STATS_PATH)


def load_learning() -> None:
    """Load persisted merchant stats from disk into memory. Safe to call at startup."""
    path = _stats_path()
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text())
        for merchant, stats in data.items():
            merchant_stats[merchant].update(stats)
        log.info("learning: loaded %d merchant stats from %s", len(data), path)
    except Exception as exc:
        log.warning("learning: failed to load stats file (%s): %s", path, exc)


def _save_learning() -> None:
    """Flush current merchant_stats to disk."""
    path = _stats_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(dict(merchant_stats), sort_keys=True))
    except Exception as exc:
        log.warning("learning: failed to save stats file (%s): %s", path, exc)


# ---------------------------
# CORE FUNCTIONS
# ---------------------------

def update_learning(
    merchant: str,
    label: str,
    category: Optional[str]
) -> Optional[Dict[str, Any]]:
    """
    Update learning stats for a merchant.
    Returns learned rule if threshold reached, persists to disk on every update.
    """
    if not merchant or not label:
        return None

    key = merchant.lower().strip()

    merchant_stats[key]["count"] += 1
    merchant_stats[key]["label"] = label
    merchant_stats[key]["category"] = category

    _save_learning()

    if merchant_stats[key]["count"] >= LEARN_THRESHOLD:
        return {
            "merchant": key,
            "label": label,
            "category": category,
            "count": merchant_stats[key]["count"]
        }

    return None


def get_learned_rule(merchant: str) -> Optional[Dict[str, Any]]:
    """Returns learned rule if merchant has reached the threshold."""
    if not merchant:
        return None

    key = merchant.lower().strip()
    data = merchant_stats.get(key)

    if data and data["count"] >= LEARN_THRESHOLD:
        return data

    return None


# ---------------------------
# OPTIONAL UTILITIES
# ---------------------------

def reset_learning():
    """Clear all learned data (useful for testing)."""
    merchant_stats.clear()


def get_all_learning() -> Dict[str, Any]:
    """Debug: get all learning stats."""
    return dict(merchant_stats)

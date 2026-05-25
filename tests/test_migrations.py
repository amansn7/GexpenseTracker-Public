import os
import subprocess
import tempfile

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALEMBIC = os.path.join(PROJECT_ROOT, ".venv", "bin", "alembic")


def test_alembic_heads_are_single():
    result = subprocess.run(
        [ALEMBIC, "heads"],
        capture_output=True,
        text=True,
        cwd=PROJECT_ROOT,
    )
    assert result.returncode == 0, f"alembic heads failed:\n{result.stderr}"
    heads = [h for h in result.stdout.strip().split("\n") if h.strip() and "(head)" in h]
    assert len(heads) == 1, f"Expected exactly 1 alembic head, got {len(heads)}: {heads}"


def test_alembic_upgrade_and_downgrade():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}", "TESTING": "1"}

    try:
        result = subprocess.run(
            [ALEMBIC, "upgrade", "head"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
            env=env,
        )
        assert result.returncode == 0, f"alembic upgrade head failed:\n{result.stderr}\n{result.stdout}"

        # Downgrade one branch from the merge head
        result = subprocess.run(
            [ALEMBIC, "downgrade", "0039_encrypt_totp_secrets"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
            env=env,
        )
        assert result.returncode == 0, f"alembic downgrade to parent failed:\n{result.stderr}\n{result.stdout}"

        # Re-upgrade to head
        result = subprocess.run(
            [ALEMBIC, "upgrade", "head"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
            env=env,
        )
        assert result.returncode == 0, f"alembic upgrade head (2nd pass) failed:\n{result.stderr}\n{result.stdout}"
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)
        for suffix in ("-wal", "-shm"):
            p = db_path + suffix
            if os.path.exists(p):
                os.unlink(p)

import pytest
from app.models import DuplicatePair, DomainPairRule

def test_models_importable():
    assert DuplicatePair.__tablename__ == "duplicate_pairs"
    assert DomainPairRule.__tablename__ == "domain_pair_rules"

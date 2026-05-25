"""TDD tests for Goals service — run BEFORE implementation to confirm red."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth_deps import get_current_user
from app.database import get_db
from app.main import app

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


async def _client(db_session, mock_user) -> AsyncClient:
    async def _db():
        yield db_session

    async def _user():
        return mock_user

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _cleanup():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# POST /api/goals — create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_goal_minimal(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(
                "/api/goals",
                json={
                    "name": "Emergency Fund",
                    "target_amount": 100000.00,
                },
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["name"] == "Emergency Fund"
            assert float(data["target_amount"]) == 100000.00
            assert float(data["current_amount"]) == 0.0
            assert float(data["pct"]) == 0.0
            assert float(data["remaining"]) == 100000.00
            assert data["active"] is True
            assert data["target_date"] is None
            assert data["category"] is None
            assert "id" in data
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_create_goal_full(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(
                "/api/goals",
                json={
                    "name": "New Car",
                    "target_amount": 500000.00,
                    "target_date": "2027-01-01",
                    "category": "Transport",
                    "notes": "Save for Honda City",
                },
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["name"] == "New Car"
            assert data["target_date"] == "2027-01-01"
            assert data["category"] == "Transport"
            assert data["notes"] == "Save for Honda City"
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_create_goal_zero_amount_rejected(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(
                "/api/goals",
                json={
                    "name": "Bad Goal",
                    "target_amount": 0,
                },
            )
            assert resp.status_code == 422
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_create_goal_negative_amount_rejected(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(
                "/api/goals",
                json={
                    "name": "Negative",
                    "target_amount": -500,
                },
            )
            assert resp.status_code == 422
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_create_goal_empty_name_rejected(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(
                "/api/goals",
                json={
                    "name": "   ",
                    "target_amount": 10000,
                },
            )
            assert resp.status_code == 422
    finally:
        _cleanup()


# ---------------------------------------------------------------------------
# GET /api/goals — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_goals_empty(db_session, mock_user):
    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get("/api/goals")
            assert resp.status_code == 200
            assert resp.json() == {"goals": []}
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_list_goals_returns_own_goals_only(db_session, mock_user):
    import uuid

    from app.models import Goal

    other_user_id = str(uuid.uuid4())
    g1 = Goal(user_id=mock_user.id, name="My Goal", target_amount=50000)
    g2 = Goal(user_id=other_user_id, name="Other Goal", target_amount=99999)
    db_session.add_all([g1, g2])
    await db_session.commit()

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get("/api/goals")
            assert resp.status_code == 200
            goals = resp.json()["goals"]
            assert len(goals) == 1
            assert goals[0]["name"] == "My Goal"
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_list_goals_computed_fields(db_session, mock_user):
    from app.models import Goal, GoalContribution

    g = Goal(user_id=mock_user.id, name="Holiday", target_amount=20000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    c1 = GoalContribution(goal_id=g.id, user_id=mock_user.id, amount=5000, note="First save")
    c2 = GoalContribution(goal_id=g.id, user_id=mock_user.id, amount=3000)
    db_session.add_all([c1, c2])
    await db_session.commit()

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get("/api/goals")
            data = resp.json()["goals"][0]
            assert float(data["current_amount"]) == 8000.0
            assert float(data["remaining"]) == 12000.0
            assert abs(float(data["pct"]) - 40.0) < 0.1
    finally:
        _cleanup()


# ---------------------------------------------------------------------------
# GET /api/goals/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_goal_by_id(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Laptop", target_amount=80000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get(f"/api/goals/{g.id}")
            assert resp.status_code == 200
            assert resp.json()["name"] == "Laptop"
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_get_goal_not_found(db_session, mock_user):
    import uuid

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get(f"/api/goals/{uuid.uuid4()}")
            assert resp.status_code == 404
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_get_goal_other_user_returns_404(db_session, mock_user):
    import uuid

    from app.models import Goal

    g = Goal(user_id=str(uuid.uuid4()), name="Not Mine", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get(f"/api/goals/{g.id}")
            assert resp.status_code == 404
    finally:
        _cleanup()


# ---------------------------------------------------------------------------
# PATCH /api/goals/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_goal_name(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Old Name", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.patch(f"/api/goals/{g.id}", json={"name": "New Name"})
            assert resp.status_code == 200
            assert resp.json()["name"] == "New Name"
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_patch_goal_target_amount(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Fund", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.patch(f"/api/goals/{g.id}", json={"target_amount": 25000})
            assert resp.status_code == 200
            assert float(resp.json()["target_amount"]) == 25000.0
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_patch_goal_target_date_and_notes(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Trip", target_amount=30000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.patch(
                f"/api/goals/{g.id}",
                json={
                    "target_date": "2026-12-31",
                    "notes": "Goa trip savings",
                },
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["target_date"] == "2026-12-31"
            assert data["notes"] == "Goa trip savings"
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_patch_goal_not_found(db_session, mock_user):
    import uuid

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.patch(f"/api/goals/{uuid.uuid4()}", json={"name": "X"})
            assert resp.status_code == 404
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_patch_goal_zero_amount_rejected(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Test", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.patch(f"/api/goals/{g.id}", json={"target_amount": 0})
            assert resp.status_code == 422
    finally:
        _cleanup()


# ---------------------------------------------------------------------------
# POST /api/goals/{id}/contributions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_contribution(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Savings", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/goals/{g.id}/contributions", json={"amount": 2500})
            assert resp.status_code == 201
            data = resp.json()
            assert float(data["current_amount"]) == 2500.0
            assert float(data["remaining"]) == 7500.0
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_add_multiple_contributions(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Big Fund", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            await client.post(f"/api/goals/{g.id}/contributions", json={"amount": 3000})
            await client.post(f"/api/goals/{g.id}/contributions", json={"amount": 4000})
            resp = await client.get(f"/api/goals/{g.id}")
            data = resp.json()
            assert float(data["current_amount"]) == 7000.0
            assert float(data["remaining"]) == 3000.0
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_add_contribution_zero_amount_rejected(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Test", target_amount=5000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/goals/{g.id}/contributions", json={"amount": 0})
            assert resp.status_code == 422
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_add_contribution_to_missing_goal(db_session, mock_user):
    import uuid

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/goals/{uuid.uuid4()}/contributions", json={"amount": 500})
            assert resp.status_code == 404
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_add_contribution_to_other_users_goal_returns_404(db_session, mock_user):
    import uuid

    from app.models import Goal

    g = Goal(user_id=str(uuid.uuid4()), name="Theirs", target_amount=10000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.post(f"/api/goals/{g.id}/contributions", json={"amount": 100})
            assert resp.status_code == 404
    finally:
        _cleanup()


# ---------------------------------------------------------------------------
# DELETE /api/goals/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_goal(db_session, mock_user):
    from app.models import Goal

    g = Goal(user_id=mock_user.id, name="Delete Me", target_amount=1000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)
    gid = g.id

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.delete(f"/api/goals/{gid}")
            assert resp.status_code == 200
            assert resp.json()["deleted"] == gid

            resp2 = await client.get(f"/api/goals/{gid}")
            assert resp2.status_code == 404
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_delete_goal_cascades_contributions(db_session, mock_user):
    from sqlalchemy import select

    from app.models import Goal, GoalContribution

    g = Goal(user_id=mock_user.id, name="Cascade Test", target_amount=5000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    c = GoalContribution(goal_id=g.id, user_id=mock_user.id, amount=500)
    db_session.add(c)
    await db_session.commit()
    cid = c.id

    client = await _client(db_session, mock_user)
    try:
        async with client:
            await client.delete(f"/api/goals/{g.id}")

        remaining = (
            await db_session.execute(select(GoalContribution).where(GoalContribution.id == cid))
        ).scalar_one_or_none()
        assert remaining is None
    finally:
        _cleanup()


@pytest.mark.asyncio
async def test_delete_goal_not_found(db_session, mock_user):
    import uuid

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.delete(f"/api/goals/{uuid.uuid4()}")
            assert resp.status_code == 404
    finally:
        _cleanup()


# ---------------------------------------------------------------------------
# pct cap at 100 when over-funded
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pct_capped_at_100_when_overfunded(db_session, mock_user):
    from app.models import Goal, GoalContribution

    g = Goal(user_id=mock_user.id, name="Overfunded", target_amount=1000)
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    c = GoalContribution(goal_id=g.id, user_id=mock_user.id, amount=1500)
    db_session.add(c)
    await db_session.commit()

    client = await _client(db_session, mock_user)
    try:
        async with client:
            resp = await client.get(f"/api/goals/{g.id}")
            data = resp.json()
            assert float(data["pct"]) == 100.0
            assert float(data["remaining"]) == 0.0
    finally:
        _cleanup()

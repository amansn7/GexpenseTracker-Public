#!/usr/bin/env python3
"""
Test Template Generator

Generates boilerplate test files for async Python testing based on the
Async Testing Expert skill patterns.

Usage:
    python generate_test_template.py --module user --layer dao
    python generate_test_template.py --module publication --layer service
    python generate_test_template.py --module deadlines --layer router
"""

import argparse
import sys
from pathlib import Path


DAO_TEMPLATE = '''"""Tests for {module_title}DAO database access layer."""
from datetime import datetime
import pytest
from src.domain.dal.dao.{module} import {module_title}DAO
from src.domain.dal.dao.exception import DAOException
from src.domain.dto.{module} import {module_title}DTO
from tests.fakes import FakeConnection, FakeRecord


@pytest.mark.asyncio
async def test_create_calls_execute(faker):
    """Test that create method calls execute with correct SQL and parameters."""
    # Arrange: Prepare test data
    create_dto = {module_title}DTO.Create(
        # TODO: Add required fields here
    )
    conn = FakeConnection()

    # Act: Call DAO method with __wrapped__
    await {module_title}DAO.create.__wrapped__(conn, create_dto)

    # Assert: Verify execute was called
    assert len(conn.execute_calls) == 1
    stmt, params = conn.execute_calls[0]
    assert 'INSERT INTO {table_name}' in stmt
    assert isinstance(params, list)


@pytest.mark.asyncio
async def test_fetch_by_id_success(faker):
    """Test that fetch_by_id returns properly formatted DTO."""
    # Arrange
    fake_row = {{
        'id': faker.random_int(1, 100),
        # TODO: Add other fields
    }}
    conn = FakeConnection()
    conn.fetch_row_return = FakeRecord(fake_row)

    # Act
    result = await {module_title}DAO.fetch_by_id.__wrapped__(conn, fake_row['id'])

    # Assert
    assert result.id == fake_row['id']
    assert isinstance(result, {module_title}DTO.Read)


@pytest.mark.asyncio
async def test_fetch_by_id_error_maps_to_500():
    """Test that database errors are properly handled."""
    conn = FakeConnection()

    async def broken_fetch_row(stmt, parameters=None):
        raise Exception('Database connection lost')

    conn.fetch_row = broken_fetch_row

    with pytest.raises(DAOException) as exc:
        await {module_title}DAO.fetch_by_id.__wrapped__(conn, 1)

    err = exc.value
    assert err.status_code == 500


@pytest.mark.asyncio
async def test_update_calls_execute_with_correct_params(faker):
    """Test that update method executes update query with correct parameters."""
    # Arrange
    update_dto = {module_title}DTO.Update(
        # TODO: Add update fields
    )
    conn = FakeConnection()

    # Act
    await {module_title}DAO.update.__wrapped__(conn, 1, update_dto)

    # Assert
    assert len(conn.execute_calls) == 1
    stmt, params = conn.execute_calls[0]
    assert 'UPDATE {table_name}' in stmt


@pytest.mark.asyncio
async def test_delete_sets_inactive_flag(faker):
    """Test that delete method sets fg_ativo to false."""
    # Arrange
    conn = FakeConnection()

    # Act
    await {module_title}DAO.delete.__wrapped__(conn, 1)

    # Assert
    assert len(conn.execute_calls) == 1
    stmt, params = conn.execute_calls[0]
    assert 'UPDATE {table_name}' in stmt
    assert 'fg_ativo' in stmt.lower()


# TODO: Add more test cases:
# - test_read_all_returns_list
# - test_read_with_filters
# - test_batch_operations
# - test_transaction_rollback_on_error
'''

SERVICE_TEMPLATE = '''"""Tests for {module_title}Service business logic layer."""
from datetime import datetime
import pytest
from src.domain.service.{module} import {module_title}Service
from src.domain.dto.{module} import {module_title}DTO


class Dummy{module_title}DAO:
    """Mock DAO for service testing."""
    def __init__(self):
        self.create_called = False
        self.fetch_called = False
        self.update_called = False

    async def create(self, dto):
        self.create_called = dto
        return 1

    async def fetch_by_id(self, id_):
        self.fetch_called = id_
        return {module_title}DTO.Read(
            id=id_,
            # TODO: Add other required fields
        )

    async def update(self, id_, dto):
        self.update_called = (id_, dto)


class DummyAdapter:
    """Mock adapter for external service calls."""
    def __init__(self):
        self.called = False

    async def some_method(self, *args, **kwargs):
        self.called = True
        return []


@pytest.mark.asyncio
async def test_service_create_delegates_to_dao(faker):
    """Test that service create method properly delegates to DAO."""
    # Arrange
    dao = Dummy{module_title}DAO()
    adapter = DummyAdapter()
    service = {module_title}Service(
        {module}_dao=dao,
        adapter=adapter
    )

    dto = {module_title}DTO.Create(
        # TODO: Add required fields
    )

    # Act
    result = await service.create(dto)

    # Assert
    assert dao.create_called == dto
    assert result == 1


@pytest.mark.asyncio
async def test_service_coordinates_multiple_daos():
    """Test that service properly coordinates between multiple DAOs."""
    # Arrange
    dao = Dummy{module_title}DAO()
    adapter = DummyAdapter()
    service = {module_title}Service(
        {module}_dao=dao,
        adapter=adapter
    )

    # Act
    result = await service.get_by_id(1)

    # Assert
    assert dao.fetch_called == 1
    assert isinstance(result, {module_title}DTO.Read)


@pytest.mark.asyncio
async def test_service_validates_business_rules(faker):
    """Test that service enforces business rule validation."""
    # Arrange
    dao = Dummy{module_title}DAO()
    service = {module_title}Service({module}_dao=dao, adapter=None)

    # TODO: Create invalid DTO that violates business rules

    # Act & Assert
    with pytest.raises(Exception):  # TODO: Use specific exception
        await service.create(invalid_dto)


# TODO: Add more test cases:
# - test_service_handles_dao_exceptions
# - test_service_transforms_dtos_correctly
# - test_service_calls_adapter_when_needed
'''

ROUTER_TEMPLATE = '''"""Tests for {module_title} API endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_{module}_endpoint(async_client: AsyncClient, monkeypatch):
    """Test GET /{module}s endpoint returns proper response."""
    # Mock the service layer
    async def mock_get_all():
        return [{{
            'id': 1,
            # TODO: Add response fields
        }}]

    monkeypatch.setattr(
        'src.api.path.{module}.{module_title}Service.get_all',
        mock_get_all
    )

    # Act
    response = await async_client.get('/{module}s')

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


@pytest.mark.asyncio
async def test_get_{module}_by_id_endpoint(async_client: AsyncClient, monkeypatch):
    """Test GET /{module}s/{{id}} endpoint returns single item."""
    # Mock service
    async def mock_get_by_id(id_):
        return {{
            'id': id_,
            # TODO: Add response fields
        }}

    monkeypatch.setattr(
        'src.api.path.{module}.{module_title}Service.get_by_id',
        mock_get_by_id
    )

    # Act
    response = await async_client.get('/{module}s/1')

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data['id'] == 1


@pytest.mark.asyncio
async def test_create_{module}_endpoint(async_client: AsyncClient, monkeypatch):
    """Test POST /{module}s endpoint creates new item."""
    # Mock service
    async def mock_create(dto):
        return 1

    monkeypatch.setattr(
        'src.api.path.{module}.{module_title}Service.create',
        mock_create
    )

    # Act
    response = await async_client.post(
        '/{module}s',
        json={{
            # TODO: Add request body fields
        }}
    )

    # Assert
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_update_{module}_endpoint(async_client: AsyncClient, monkeypatch):
    """Test PUT /{module}s/{{id}} endpoint updates item."""
    # Mock service
    async def mock_update(id_, dto):
        return None

    monkeypatch.setattr(
        'src.api.path.{module}.{module_title}Service.update',
        mock_update
    )

    # Act
    response = await async_client.put(
        '/{module}s/1',
        json={{
            # TODO: Add update fields
        }}
    )

    # Assert
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_delete_{module}_endpoint(async_client: AsyncClient, monkeypatch):
    """Test DELETE /{module}s/{{id}} endpoint deletes item."""
    # Mock service
    async def mock_delete(id_):
        return None

    monkeypatch.setattr(
        'src.api.path.{module}.{module_title}Service.delete',
        mock_delete
    )

    # Act
    response = await async_client.delete('/{module}s/1')

    # Assert
    assert response.status_code == 204


# TODO: Add more test cases:
# - test_validation_errors_return_422
# - test_not_found_returns_404
# - test_authentication_required
# - test_permission_checks
'''


def generate_test(module: str, layer: str, output_dir: str = 'tests') -> None:
    """Generate a test file template for the specified module and layer."""
    module_title = module.title().replace('_', '')
    table_name = module.lower()

    templates = {
        'dao': DAO_TEMPLATE,
        'service': SERVICE_TEMPLATE,
        'router': ROUTER_TEMPLATE,
    }

    if layer not in templates:
        print(f"Error: Unknown layer '{layer}'. Choose from: {', '.join(templates.keys())}")
        sys.exit(1)

    template = templates[layer]
    content = template.format(
        module=module,
        module_title=module_title,
        table_name=table_name
    )

    output_path = Path(output_dir) / f'test_{module}_{layer}.py'

    if output_path.exists():
        print(f"Warning: {output_path} already exists. Overwrite? (y/n): ", end='')
        if input().lower() != 'y':
            print("Aborted.")
            return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content)

    print(f"✅ Generated test file: {output_path}")
    print(f"📝 Remember to:")
    print(f"   - Fill in TODO sections")
    print(f"   - Add required imports")
    print(f"   - Customize test cases for your specific needs")
    print(f"   - Run: pytest {output_path} -v")


def main():
    parser = argparse.ArgumentParser(
        description='Generate async test templates based on Async Testing Expert skill'
    )
    parser.add_argument(
        '--module',
        required=True,
        help='Module name (e.g., user, publication, deadline)'
    )
    parser.add_argument(
        '--layer',
        required=True,
        choices=['dao', 'service', 'router'],
        help='Layer to test (dao, service, or router)'
    )
    parser.add_argument(
        '--output',
        default='tests',
        help='Output directory (default: tests)'
    )

    args = parser.parse_args()

    generate_test(args.module, args.layer, args.output)


if __name__ == '__main__':
    main()

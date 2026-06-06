# Async Testing Expert Skill

Comprehensive pytest skill for async Python testing with proper mocking, fixtures, and patterns from a production-ready 387-test FastAPI backend.

## What This Skill Provides

- **Complete testing patterns** for async Python applications
- **Production-proven fixtures** for FastAPI testing (app, async_client, event_loop, faker)
- **Comprehensive mock objects** (FakeConnection, FakeRecord, FakeTransaction)
- **Layer-specific testing strategies** for DAO, Service, and Router layers
- **Test template generator** for rapid test creation
- **Best practices checklist** for writing maintainable tests

## When to Use

Activate this skill when you need to:
- Write async tests for FastAPI applications
- Test async database operations (PostgreSQL, async drivers)
- Set up pytest fixtures for async apps
- Create mock objects for database connections
- Test services with dependency injection
- Write DAO (Data Access Object) layer tests
- Test async API endpoints

## Quick Start

### 1. Use the Skill in Claude Code

Simply invoke the skill when working on async testing:

```
/skill async-testing-expert
```

Or let Claude automatically detect when you need it by mentioning async testing in your prompts.

### 2. Generate Test Boilerplate

Use the included template generator:

```bash
# Generate DAO layer test template
python ~/.claude/skills/async-testing-expert/generate_test_template.py \
    --module user \
    --layer dao

# Generate Service layer test template
python ~/.claude/skills/async-testing-expert/generate_test_template.py \
    --module publication \
    --layer service

# Generate Router (API) layer test template
python ~/.claude/skills/async-testing-expert/generate_test_template.py \
    --module deadline \
    --layer router
```

This generates test files in your `tests/` directory with:
- Proper imports and structure
- Sample test cases following best practices
- TODO markers for customization
- All necessary fixtures and mocks

### 3. Copy Mock Objects to Your Project

The skill includes production-ready mock objects. Copy them to your project:

```bash
# Create fakes.py in your tests directory
cp ~/.claude/skills/async-testing-expert/examples/fakes.py tests/

# Create conftest.py with fixtures
cp ~/.claude/skills/async-testing-expert/examples/conftest.py tests/
```

## File Structure

```
async-testing-expert/
├── SKILL.md                      # Main skill instructions for Claude
├── README.md                     # This file
├── generate_test_template.py    # Test template generator script
└── examples/                     # Example files (coming soon)
    ├── fakes.py                  # Mock objects
    ├── conftest.py               # Pytest fixtures
    └── test_examples.py          # Complete test examples
```

## Key Features

### 1. Comprehensive Mock Objects

**FakeConnection** - Full database connection mock:
- Tracks all execute/fetch calls
- Supports transactions
- Simulates errors
- Works with execute_many for batch operations

**FakeRecord** - Query result mock:
- Simulates database record structure
- Supports .result() method
- Handles rowcount

**FakeTransaction** - Transaction context mock:
- Async context manager
- Supports all query methods
- Tracks transaction calls

### 2. Layer-Specific Testing Patterns

**DAO Layer (Data Access)**:
- Use `__wrapped__` to bypass connection decorators
- Direct FakeConnection injection
- SQL statement verification
- Parameter validation

**Service Layer (Business Logic)**:
- Dummy DAO/Adapter classes
- Dependency injection testing
- Business rule validation
- DTO transformation checks

**Router Layer (API Endpoints)**:
- AsyncClient for endpoint testing
- Monkeypatch for service mocking
- Response status and structure validation
- Authentication/authorization testing

### 3. Testing Patterns Covered

- ✅ Basic CRUD operations
- ✅ Exception handling and error mapping
- ✅ Batch operations with execute_many
- ✅ Transaction testing
- ✅ Multiple queries with different results
- ✅ Parametrized tests
- ✅ Monkeypatching for dependency injection
- ✅ FastAPI endpoint testing
- ✅ Service layer coordination
- ✅ Complex business logic validation

## Testing Best Practices from the Skill

1. **Naming**: `test_<what>_<scenario>` (e.g., `test_create_calls_execute`, `test_fetch_by_id_error_maps_to_500`)
2. **Structure**: Arrange-Act-Assert with clear sections
3. **Documentation**: Docstrings explaining what each test validates
4. **Type Hints**: All variables should have type annotations
5. **Isolation**: Each test should be independent
6. **Coverage**: Test both happy paths and error scenarios
7. **Verification**: Check SQL statements, not just return values

## Example Usage

### Testing a DAO Method

```python
@pytest.mark.asyncio
async def test_create_calls_execute(faker):
    """Test that create method calls execute with correct SQL and parameters."""
    # Arrange
    create_dto = UserDTO.Create(
        name=faker.name(),
        email=faker.email()
    )
    conn = FakeConnection()

    # Act
    await UserDAO.create.__wrapped__(conn, create_dto)

    # Assert
    assert len(conn.execute_calls) == 1
    stmt, params = conn.execute_calls[0]
    assert 'INSERT INTO users' in stmt
```

### Testing a Service

```python
@pytest.mark.asyncio
async def test_service_coordinates_dao():
    """Test that service properly coordinates DAO calls."""
    dao = DummyUserDAO()
    service = UserService(user_dao=dao)

    result = await service.get_all_users()

    assert dao.fetch_all_called
    assert isinstance(result[0], UserDTO.Read)
```

### Testing an API Endpoint

```python
@pytest.mark.asyncio
async def test_get_users_endpoint(async_client, monkeypatch):
    """Test GET /users endpoint returns proper response."""
    async def mock_get_users():
        return [UserDTO.Read(id=1, name='Test', email='test@example.com')]

    monkeypatch.setattr('src.api.path.users.get_all', mock_get_users)

    response = await async_client.get('/users')

    assert response.status_code == 200
    assert len(response.json()) == 1
```

## Commands Reference

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_user_dao.py -v

# Run with coverage
pytest --cov=src --cov-report=html tests/

# Run single test
pytest tests/test_user_dao.py::test_create_calls_execute -v

# Stop on first failure
pytest -x tests/

# Run only failed tests from last run
pytest --lf tests/

# Show local variables on failure
pytest --showlocals tests/
```

## Integration with Your Project

### 1. Copy Required Files

```bash
# Copy mock objects
mkdir -p tests
cat > tests/fakes.py << 'EOF'
# Paste FakeConnection, FakeRecord, FakeTransaction from SKILL.md
EOF

# Copy fixtures
cat > tests/conftest.py << 'EOF'
# Paste fixtures from SKILL.md
EOF
```

### 2. Install Dependencies

```bash
pip install pytest pytest-asyncio httpx faker
# or with rye
rye add --dev pytest pytest-asyncio httpx faker
```

### 3. Configure pytest

Create `pyproject.toml` or `pytest.ini`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
python_files = "test_*.py"
python_classes = "Test*"
python_functions = "test_*"
```

## Tips for Success

1. **Start with the template generator** - It creates proper structure
2. **Use type hints everywhere** - Makes tests self-documenting
3. **Mock at the right level** - Connection for DAO, Service for Router
4. **Verify SQL statements** - Don't just check return values
5. **Test error paths** - Exception handling is critical
6. **Keep tests isolated** - No shared state between tests
7. **Use descriptive names** - Test name should explain what and when

## Source

This skill is based on patterns extracted from the SISJUR backend project:
- 387 passing unit tests
- FastAPI with async/await
- PostgreSQL with psqlpy driver
- Clean architecture (DAO/Service/Router layers)
- Production-ready and battle-tested

## License

This skill is provided as-is for educational and development purposes. Feel free to adapt and modify for your needs.

## Feedback

Found an issue or have suggestions? This skill is designed to evolve with your testing needs. Share feedback to improve it!

"""add users and seed test accounts

Revision ID: 20260429_0700
Revises: 20260427_2315
Create Date: 2026-04-29 07:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

from app.services.auth_service import hash_password


revision = "20260429_0700"
down_revision = "20260427_2315"
branch_labels = None
depends_on = None


TEST_USERS = [
    ("11111111-1111-4111-8111-111111111111", "user1@example.com", "user1", "测试用户1", "user"),
    ("22222222-2222-4222-8222-222222222222", "user2@example.com", "user2", "测试用户2", "user"),
    ("33333333-3333-4333-8333-333333333333", "user3@example.com", "user3", "测试用户3", "user"),
    ("44444444-4444-4444-8444-444444444444", "user4@example.com", "user4", "测试用户4", "user"),
    ("55555555-5555-4555-8555-555555555555", "admin@example.com", "admin", "测试管理员", "admin"),
]


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def _index_names(bind, table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}


def _add_patient_owner_id(bind) -> None:
    if "patients" not in _table_names(bind):
        return
    if "owner_id" not in _column_names(bind, "patients"):
        op.add_column("patients", sa.Column("owner_id", sa.Uuid(as_uuid=False), nullable=True))
    if "idx_patients_owner_id" not in _index_names(bind, "patients"):
        op.create_index("idx_patients_owner_id", "patients", ["owner_id"])


def _create_users_table(bind) -> None:
    if "users" in _table_names(bind):
        return
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="user"),
        sa.Column("permissions", sa.String(length=1000), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def _ensure_user_indexes(bind) -> None:
    indexes = _index_names(bind, "users")
    if "idx_users_email" not in indexes:
        op.create_index("idx_users_email", "users", ["email"], unique=True)
    if "idx_users_username" not in indexes:
        op.create_index("idx_users_username", "users", ["username"], unique=True)


def _seed_test_users(bind) -> None:
    users_table = sa.table(
        "users",
        sa.column("id", sa.Uuid(as_uuid=False)),
        sa.column("email", sa.String),
        sa.column("username", sa.String),
        sa.column("name", sa.String),
        sa.column("password_hash", sa.String),
        sa.column("role", sa.String),
        sa.column("permissions", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    for user_id, email, username, name, role in TEST_USERS:
        exists = bind.execute(sa.text("SELECT 1 FROM users WHERE email = :email"), {"email": email}).first()
        if exists:
            continue
        bind.execute(
            users_table.insert().values(
                id=user_id,
                email=email,
                username=username,
                name=name,
                password_hash=hash_password("123456"),
                role=role,
                permissions="*" if role == "admin" else "",
                is_active=True,
            )
        )


def upgrade():
    bind = op.get_bind()
    _add_patient_owner_id(bind)
    _create_users_table(bind)
    _ensure_user_indexes(bind)
    _seed_test_users(bind)


def downgrade():
    bind = op.get_bind()
    if "users" in _table_names(bind):
        indexes = _index_names(bind, "users")
        if "idx_users_username" in indexes:
            op.drop_index("idx_users_username", table_name="users")
        if "idx_users_email" in indexes:
            op.drop_index("idx_users_email", table_name="users")
        op.drop_table("users")
    if "patients" in _table_names(bind):
        indexes = _index_names(bind, "patients")
        if "idx_patients_owner_id" in indexes:
            op.drop_index("idx_patients_owner_id", table_name="patients")
        if "owner_id" in _column_names(bind, "patients"):
            op.drop_column("patients", "owner_id")

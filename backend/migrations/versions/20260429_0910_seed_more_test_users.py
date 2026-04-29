"""seed more test users

Revision ID: 20260429_0910
Revises: 20260429_0700
Create Date: 2026-04-29 09:10:00.000000

"""

from alembic import op
import sqlalchemy as sa

from app.services.auth_service import hash_password


revision = "20260429_0910"
down_revision = "20260429_0700"
branch_labels = None
depends_on = None


TEST_USERS = [
    ("66666666-6666-4666-8666-666666666666", "user5@example.com", "user5", "测试用户5", "user"),
    ("77777777-7777-4777-8777-777777777777", "user6@example.com", "user6", "测试用户6", "user"),
    ("88888888-8888-4888-8888-888888888888", "user7@example.com", "user7", "测试用户7", "user"),
    ("99999999-9999-4999-8999-999999999999", "user8@example.com", "user8", "测试用户8", "user"),
    ("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "user9@example.com", "user9", "测试用户9", "user"),
]


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _seed_test_users(bind) -> None:
    if "users" not in _table_names(bind):
        return

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
        exists = bind.execute(sa.text("SELECT 1 FROM users WHERE email = :email OR username = :username"), {"email": email, "username": username}).first()
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
    _seed_test_users(op.get_bind())


def downgrade():
    bind = op.get_bind()
    if "users" not in _table_names(bind):
        return
    emails = [email for _, email, _, _, _ in TEST_USERS]
    bind.execute(sa.text("DELETE FROM users WHERE email = ANY(:emails)"), {"emails": emails})

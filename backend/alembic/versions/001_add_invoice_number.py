"""add invoice_number to payments

Revision ID: 001_add_invoice_number
Revises:
Create Date: 2026-04-18

"""
from alembic import op
import sqlalchemy as sa

revision = '001_add_invoice_number'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('payments') as batch_op:
        batch_op.add_column(sa.Column('invoice_number', sa.String(20), nullable=True))
    try:
        with op.batch_alter_table('payments') as batch_op:
            batch_op.create_index('ix_payments_invoice_number', ['invoice_number'], unique=True)
    except Exception:
        pass


def downgrade():
    with op.batch_alter_table('payments') as batch_op:
        try:
            batch_op.drop_index('ix_payments_invoice_number')
        except Exception:
            pass
        batch_op.drop_column('invoice_number')

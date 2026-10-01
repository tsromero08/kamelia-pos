"""blocks 2/3/4: addons, courtesy, delivery_mode, payment_splits, fiscal_data

Revision ID: 002_blocks_234
Revises: 001_add_invoice_number
Create Date: 2026-05-14

Implementa los siguientes cambios (también aplicados via autoseed soft en main.py
para entornos sin Alembic):
- orders.is_courtesy (Bloque 2)
- orders.delivery_mode, orders.delivery_fee (Bloque 3)
- orders.customer_type, orders.tax_type, orders.tax_id (Bloque 4)
- payments.is_split (Bloque 4)
- nueva tabla addons (Bloque 2)
- nueva tabla payment_splits (Bloque 4)
"""
from alembic import op
import sqlalchemy as sa

revision = '002_blocks_234'
down_revision = '001_add_invoice_number'
branch_labels = None
depends_on = None


def upgrade():
    # ── orders: nuevas columnas ──────────────────────────────────────────
    with op.batch_alter_table('orders') as batch_op:
        batch_op.add_column(sa.Column(
            'is_courtesy', sa.Boolean(), nullable=False, server_default=sa.text('0')
        ))
        batch_op.add_column(sa.Column(
            'delivery_mode', sa.String(20), nullable=False, server_default='none'
        ))
        batch_op.add_column(sa.Column(
            'delivery_fee', sa.Numeric(12, 2), nullable=False, server_default='0'
        ))
        batch_op.add_column(sa.Column(
            'customer_type', sa.String(20), nullable=False, server_default='natural'
        ))
        batch_op.add_column(sa.Column('tax_type', sa.String(80), nullable=True))
        batch_op.add_column(sa.Column('tax_id', sa.String(40), nullable=True))

    # ── payments: is_split flag ──────────────────────────────────────────
    with op.batch_alter_table('payments') as batch_op:
        batch_op.add_column(sa.Column(
            'is_split', sa.Boolean(), nullable=False, server_default=sa.text('0')
        ))

    # ── addons (adiciones rápidas) ───────────────────────────────────────
    op.create_table(
        'addons',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('additional_price', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('inventory_item_id', sa.Integer(),
                  sa.ForeignKey('inventory_items.id'), nullable=True),
        sa.Column('inventory_quantity', sa.Numeric(14, 4), server_default='0'),
        sa.Column('icon', sa.String(20)),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('1')),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # ── payment_splits (split payment Bloque 4) ──────────────────────────
    op.create_table(
        'payment_splits',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('payment_id', sa.Integer(),
                  sa.ForeignKey('payments.id'), nullable=False),
        sa.Column('payment_method', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('reference', sa.String(200)),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # Seed categoria "Domicilios" para conciliación contable (Bloque 3)
    # Solo si la tabla expense_categories existe y la categoría no
    try:
        bind = op.get_bind()
        existing = bind.execute(sa.text(
            "SELECT id FROM expense_categories WHERE name = 'Domicilios'"
        )).fetchone()
        if not existing:
            bind.execute(sa.text(
                "INSERT INTO expense_categories (name, description, is_active) "
                "VALUES ('Domicilios', 'Pagos a repartidores (auto)', 1)"
            ))
    except Exception:
        pass


def downgrade():
    op.drop_table('payment_splits')
    op.drop_table('addons')

    with op.batch_alter_table('payments') as batch_op:
        batch_op.drop_column('is_split')

    with op.batch_alter_table('orders') as batch_op:
        batch_op.drop_column('tax_id')
        batch_op.drop_column('tax_type')
        batch_op.drop_column('customer_type')
        batch_op.drop_column('delivery_fee')
        batch_op.drop_column('delivery_mode')
        batch_op.drop_column('is_courtesy')

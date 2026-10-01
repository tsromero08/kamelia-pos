"""
Bloque 5: Automatización de Cierres.
Job que cierra automáticamente la caja cada día a las 23:59 (hora Colombia).

- Consolida ventas del día → tabla daily_summaries (vía financial_service.close_day)
- Limpia la sesión de caja (no hay tabla de sesión activa; el "cierre" en este
  POS = guardar el snapshot del día). El día siguiente arranca desde cero
  porque los reportes filtran por fecha.
- Si ya hay un cierre para hoy, lo sobreescribe (idempotente).
- Si el sistema no arrancó a las 23:59, también puede cerrar al iniciar
  detectando que el día anterior no se cerró.
"""
from datetime import datetime, date, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.db.session import SessionLocal
from app.models.financial import DailySummary
from app.services.financial_service import close_day

COLOMBIA_TZ = timezone(timedelta(hours=-5))

_scheduler: BackgroundScheduler | None = None


def auto_close_day(day: date | None = None):
    """Cierra el día indicado (default: hoy en hora Colombia)."""
    db = SessionLocal()
    try:
        target = day or datetime.now(COLOMBIA_TZ).date()
        # Idempotente: close_day hace upsert
        result = close_day(db, target, user_id=None, notes="Cierre automatico 23:59")
        print(f"[scheduler] OK Cierre automatico {target}: ${result.total_sales} ({result.total_orders} pedidos)")
        return result
    except Exception as e:
        print(f"[scheduler] ERROR Cierre automatico: {e}")
    finally:
        db.close()


CATCH_UP_DAYS = 30  # cuántos días atrás mirar al arrancar


def _catch_up_missed_closures():
    """
    Al arrancar el sistema, cerrar días previos que no fueron cerrados
    (por ejemplo si el servidor estaba apagado a las 23:59).
    Revisa los últimos `CATCH_UP_DAYS` días.
    """
    db = SessionLocal()
    try:
        today = datetime.now(COLOMBIA_TZ).date()
        closed_count = 0
        for n in range(1, CATCH_UP_DAYS + 1):  # ayer y N-1 días más atrás
            d = today - timedelta(days=n)
            existing = db.query(DailySummary).filter(
                DailySummary.summary_date == str(d)
            ).first()
            if not existing:
                try:
                    close_day(db, d, user_id=None, notes=f"Cierre diferido — catch-up al arrancar")
                    closed_count += 1
                    print(f"[scheduler] catch-up: cerrado día {d}")
                except Exception as e:
                    print(f"[scheduler] catch-up {d}: {e}")
        if closed_count > 0:
            print(f"[scheduler] catch-up total: {closed_count} dia(s) cerrado(s)")
    finally:
        db.close()


def start_scheduler():
    """Arranca el scheduler. Llamado desde main.py @app.on_event('startup')."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = BackgroundScheduler(timezone=COLOMBIA_TZ)
    # Disparador: todos los días a las 23:59 hora Colombia
    _scheduler.add_job(
        auto_close_day,
        CronTrigger(hour=23, minute=59, timezone=COLOMBIA_TZ),
        id="auto_close_day",
        replace_existing=True,
    )
    _scheduler.start()
    print("[scheduler] OK Cierre automatico programado a las 23:59 (hora Colombia)")

    # Catch-up al arranque (no bloquea)
    try:
        _catch_up_missed_closures()
    except Exception as e:
        print(f"[scheduler] catch-up falló al arrancar: {e}")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def get_status() -> dict:
    """Estado del scheduler para mostrar en UI."""
    from app.db.session import SessionLocal
    from app.models.financial import DailySummary
    db = SessionLocal()
    try:
        today = datetime.now(COLOMBIA_TZ).date()
        last = (
            db.query(DailySummary)
            .order_by(DailySummary.summary_date.desc())
            .first()
        )
        # Días pendientes en los últimos 7
        pending = []
        for n in range(1, 8):
            d = today - timedelta(days=n)
            exists = db.query(DailySummary).filter(
                DailySummary.summary_date == str(d)
            ).first()
            if not exists:
                pending.append(str(d))
        # Próximo disparo
        next_run = None
        if _scheduler is not None:
            try:
                jobs = _scheduler.get_jobs()
                if jobs:
                    nrt = jobs[0].next_run_time
                    if nrt:
                        next_run = nrt.isoformat()
            except Exception:
                pass
        return {
            "running": _scheduler is not None and _scheduler.running,
            "next_run": next_run,
            "last_closure": {
                "date": last.summary_date if last else None,
                "closed_at": last.closed_at.isoformat() if last and last.closed_at else None,
                "total_sales": float(last.total_sales) if last else 0,
                "total_expenses": float(last.total_expenses) if last else 0,
                "net_profit": float(last.net_profit) if last else 0,
            } if last else None,
            "pending_days": pending,
            "today_closed": (last is not None and last.summary_date == str(today)),
        }
    finally:
        db.close()

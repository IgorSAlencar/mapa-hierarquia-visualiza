import numpy as np
import pandas as pd
from sqlalchemy import create_engine, event, text

TARGET_AGENCIAS_ROWS = 2_000
AGENCIAS_uf_COL = "uf"
BRADESCO_BANK = "BANCO BRADESCO S.A."
AGENCIAS_TABLE = "COORDENADAS_AGENCIAS"
AGENCIAS_BACKUP_TABLE = "COORDENADAS_AGENCIAS_BACKUP"

server = "DESKTOP-G4V6794"
database = "TESTE"
username = "sa"
password = "expresso"

engine = create_engine(
    f"mssql+pyodbc://{username}:{password}@{server}/{database}"
    f"?driver=ODBC+Driver+17+for+SQL+Server&TrustServerCertificate=yes",
    connect_args={"fast_executemany": True},
)


@event.listens_for(engine, "before_cursor_execute")
def _enable_fast_executemany(conn, cursor, statement, parameters, context, executemany):
    if executemany:
        cursor.fast_executemany = True


def stratified_sample(
    frame: pd.DataFrame, target: int, column: str, *, seed: int = 42
) -> pd.DataFrame:
    """Amostra estratificada proporcional ao tamanho de cada uf."""
    if len(frame) <= target:
        return frame.copy()

    if column not in frame.columns:
        raise KeyError(f"Coluna ausente: {column}")

    work = frame.copy()
    missing = work[column].isna()
    if work[column].dtype == object or pd.api.types.is_string_dtype(work[column]):
        missing |= work[column].astype(str).str.strip().isin(("", "nan", "None"))
    work.loc[missing, column] = "(sem estado)"

    counts = work[column].value_counts()
    props = counts / counts.sum()

    raw = props * target
    alloc = np.floor(raw).astype(int)
    remainder = target - int(alloc.sum())
    if remainder > 0:
        fractional = (raw - alloc).sort_values(ascending=False)
        for state in fractional.index[:remainder]:
            alloc[state] += 1

    alloc = alloc.clip(upper=counts)

    rng = np.random.default_rng(seed)
    parts: list[pd.DataFrame] = []
    used_idx: set = set()

    for state, n in alloc.items():
        if n <= 0:
            continue
        subset = work[work[column] == state]
        n_take = min(int(n), len(subset))
        sampled = subset.sample(n=n_take, random_state=rng)
        parts.append(sampled)
        used_idx.update(sampled.index.tolist())

    result = pd.concat(parts, ignore_index=True) if parts else work.iloc[0:0].copy()

    shortfall = target - len(result)
    if shortfall > 0:
        pool = work.drop(index=list(used_idx), errors="ignore")
        if len(pool) > 0:
            extra = pool.sample(n=min(shortfall, len(pool)), random_state=rng)
            result = pd.concat([result, extra], ignore_index=True)

    if len(result) > target:
        result = result.sample(n=target, random_state=rng).reset_index(drop=True)

    return result


def _table_exists(engine, table: str) -> bool:
    with engine.connect() as conn:
        oid = conn.execute(
            text("SELECT OBJECT_ID(:full_name, N'U')"),
            {"full_name": f"dbo.{table}"},
        ).scalar()
    return oid is not None


def _is_bradesco_bank(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.upper() == BRADESCO_BANK.upper()


def backup_coordenadas_agencias_if_needed(engine) -> None:
    """Guarda a tabela original uma vez antes de sobrescrever."""
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                IF OBJECT_ID(N'dbo.{AGENCIAS_BACKUP_TABLE}', N'U') IS NULL
                AND OBJECT_ID(N'dbo.{AGENCIAS_TABLE}', N'U') IS NOT NULL
                SELECT * INTO dbo.{AGENCIAS_BACKUP_TABLE} FROM dbo.{AGENCIAS_TABLE};
                """
            )
        )


def read_agencias_source(engine) -> pd.DataFrame:
    """Lê a base completa: backup (se existir) senão COORDENADAS_AGENCIAS atual."""
    use_backup = _table_exists(engine, AGENCIAS_BACKUP_TABLE)
    source = AGENCIAS_BACKUP_TABLE if use_backup else AGENCIAS_TABLE
    print(f"Fonte: TESTE.dbo.{source}")
    return pd.read_sql_query(f"SELECT * FROM dbo.{source}", engine)


def upload_df_to_coordenadas_agencias(
    frame: pd.DataFrame, engine, *, chunksize: int = 500
) -> int:
    """Substitui TESTE.dbo.COORDENADAS_AGENCIAS pelo dataframe final."""
    frame.to_sql(
        AGENCIAS_TABLE,
        engine,
        schema="dbo",
        if_exists="replace",
        index=False,
        chunksize=chunksize,
    )
    count = int(
        pd.read_sql_query(f"SELECT COUNT(*) AS n FROM dbo.{AGENCIAS_TABLE}", engine).iloc[0, 0]
    )
    return count


def run_agencias_bradesco_sample(engine) -> None:
    """Reduz agências Bradesco a TARGET_AGENCIAS_ROWS (estratificado por uf)."""
    if not _table_exists(engine, AGENCIAS_TABLE):
        print(f"dbo.{AGENCIAS_TABLE} não existe.")
        return

    backup_coordenadas_agencias_if_needed(engine)
    ag_full = read_agencias_source(engine)
    if "banco" not in ag_full.columns:
        print(f"dbo.{AGENCIAS_TABLE} não tem coluna BANCO.")
        return

    bradesco_mask = _is_bradesco_bank(ag_full["banco"])
    outros = ag_full.loc[~bradesco_mask]
    bradesco_full = ag_full.loc[bradesco_mask]

    bradesco_sample = stratified_sample(
        bradesco_full, TARGET_AGENCIAS_ROWS, AGENCIAS_uf_COL
    )
    ag_final = pd.concat([outros, bradesco_sample], ignore_index=True)

    print(f"\n--- {AGENCIAS_TABLE} ({BRADESCO_BANK}) ---")
    print(f"Bradesco original: {len(bradesco_full):,} linhas")
    print(f"Bradesco amostra:  {len(bradesco_sample):,} linhas")
    if len(outros):
        print(f"Outros bancos (mantidos): {len(outros):,} linhas")
    if AGENCIAS_uf_COL in bradesco_sample.columns:
        print("\nDistribuição por uf (amostra Bradesco):")
        print(bradesco_sample[AGENCIAS_uf_COL].value_counts().sort_index())

    print(f"\nEnviando {len(ag_final):,} linhas para TESTE.dbo.{AGENCIAS_TABLE} ...")
    rows_ag = upload_df_to_coordenadas_agencias(ag_final, engine)
    bradesco_in_sql = int(
        pd.read_sql_query(
            text(f"SELECT COUNT(*) AS n FROM dbo.{AGENCIAS_TABLE} WHERE banco = :bank"),
            engine,
            params={"bank": BRADESCO_BANK},
        ).iloc[0, 0]
    )
    print(f"OK: dbo.{AGENCIAS_TABLE} = {rows_ag:,} linha(s); Bradesco = {bradesco_in_sql:,}.")
    print(f"Backup (se criado): TESTE.dbo.{AGENCIAS_BACKUP_TABLE}")


if __name__ == "__main__":
    run_agencias_bradesco_sample(engine)

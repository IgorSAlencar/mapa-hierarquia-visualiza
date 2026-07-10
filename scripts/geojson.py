import pandas as pd
import json

# ============================================================
# 1. CARREGAR DADOS SQL
# ============================================================

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
import sys
import subprocess

# ============================================================
# INSTALAR SHAPELY AUTOMATICAMENTE
# ============================================================

try:
    import shapely
    print(f"Shapely já instalado: {shapely.__version__}")
except ImportError:
    print("Shapely não encontrado. Instalando...")
    
    subprocess.check_call([
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--force-reinstall",
        "shapely"
    ])
    
    import shapely
    print(f"Shapely instalado: {shapely.__version__}")

# ============================================================
# IMPORTS
# ============================================================

import pandas as pd
import json

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

try:
    from shapely.validation import make_valid
except ImportError:
    # Compatibilidade com versões antigas
    def make_valid(geom):
        return geom.buffer(0)

# ============================================================
# 1. CONEXÃO COM O SQL SERVER
# ============================================================

server = "DESKTOP-G4V6794"
database = "TESTE"
username = "sa"
password = "expresso"

connection_url = URL.create(
    "mssql+pyodbc",
    username=username,
    password=password,
    host=server,
    database=database,
    query={
        "driver": "ODBC Driver 17 for SQL Server",
        "TrustServerCertificate": "yes",
    },
)

engine = create_engine(
    connection_url,
    fast_executemany=True,
)


df = pd.read_sql(text("""
    SELECT
        CHAVE_SUPERVISAO,
        DESC_SUPERVISAO,
        CD_MUNIC
    FROM TESTE..TB_SUP_MUNICIPIOS_FAKE
"""), engine)

df["CHAVE_SUPERVISAO"] = df["CHAVE_SUPERVISAO"].astype(str)
df["CD_MUNIC"] = df["CD_MUNIC"].astype(str)

print(f"Supervisões únicas: {df['CHAVE_SUPERVISAO'].nunique()}")
print(f"Municípios únicos: {df['CD_MUNIC'].nunique()}")


# ============================================================
# 2. CARREGAR GEOJSON DOS MUNICÍPIOS DO BRASIL
# ============================================================

caminho_geojson = r"C:\Users\Igor\Downloads\mapa-hierarquia-visualiza\mapa-hierarquia-visualiza\dist\geo\Brasil_Municipios.json"

with open(caminho_geojson, "r", encoding="utf-8") as f:
    brasil = json.load(f)


# ============================================================
# 3. INDEXAR MUNICÍPIOS DO GEOJSON
# ============================================================

municipios_geo = {}

for feature in brasil["features"]:
    id_7dig = str(feature["properties"]["id"])      # Ex: 1200013
    id_6dig = id_7dig[:-1]                          # Ex: 120001
    id_int = str(int(id_7dig))                       # Remove zeros à esquerda
    id_6dig_int = str(int(id_6dig))                  # Remove zeros à esquerda do 6 dígitos

    try:
        geom = shape(feature["geometry"])

        if not geom.is_valid:
            geom = make_valid(geom)

        municipios_geo[id_7dig] = {
            "nome": feature["properties"]["name"],
            "geometry": geom
        }

        municipios_geo[id_6dig] = {
            "nome": feature["properties"]["name"],
            "geometry": geom
        }

        municipios_geo[id_int] = {
            "nome": feature["properties"]["name"],
            "geometry": geom
        }

        municipios_geo[id_6dig_int] = {
            "nome": feature["properties"]["name"],
            "geometry": geom
        }

    except Exception as e:
        print(f"Erro ao processar município {id_7dig}: {e}")

print(f"Municípios carregados do GeoJSON: {len(brasil['features'])}")


# ============================================================
# 4. AGRUPAR MUNICÍPIOS POR SUPERVISÃO
# ============================================================

supervisoes = (
    df.groupby(["CHAVE_SUPERVISAO", "DESC_SUPERVISAO"])["CD_MUNIC"]
      .apply(list)
      .reset_index()
)


# ============================================================
# 5. GERAR FEATURECOLLECTION POR SUPERVISÃO
# ============================================================

features = []
sem_match = set()

for _, row in supervisoes.iterrows():
    chave_sup = str(row["CHAVE_SUPERVISAO"])
    nome_supervisao = row["DESC_SUPERVISAO"]
    lista_municipios = row["CD_MUNIC"]

    geometrias = []
    nomes_municipios = []
    municipios_nao_encontrados = []

    for cd_munic in lista_municipios:
        cd_munic_str = str(cd_munic).strip()

        if cd_munic_str in municipios_geo:
            geometrias.append(municipios_geo[cd_munic_str]["geometry"])
            nomes_municipios.append(municipios_geo[cd_munic_str]["nome"])
        else:
            municipios_nao_encontrados.append(cd_munic_str)
            sem_match.add(cd_munic_str)

    if not geometrias:
        print(f"X Supervisão {chave_sup}: nenhum município encontrado no GeoJSON")
        continue

    try:
        area_unida = unary_union(geometrias)

        if not area_unida.is_valid:
            area_unida = make_valid(area_unida)

        geo_json = mapping(area_unida)

        feature = {
            "type": "Feature",
            "properties": {
                "chave_supervisao": chave_sup,
                "nome_supervisao": nome_supervisao,
                "municipios": sorted(set(nomes_municipios)),
                "qtd_municipios": len(set(nomes_municipios)),
                "municipios_nao_encontrados": municipios_nao_encontrados
            },
            "geometry": geo_json
        }

        features.append(feature)

        status = "✓" if not municipios_nao_encontrados else "⚠"
        print(
            f"{status} Supervisão {chave_sup} ({nome_supervisao}): "
            f"{len(set(nomes_municipios))} municípios | "
            f"{len(municipios_nao_encontrados)} não encontrados"
        )

    except Exception as e:
        print(f"X Erro ao unir polígonos da supervisão {chave_sup}: {e}")


# ============================================================
# 6. SALVAR GEOJSON FINAL
# ============================================================

geojson_final = {
    "type": "FeatureCollection",
    "features": features
}

arquivo_saida = "areas_atuacao_supervisoes.geojson"

with open(arquivo_saida, "w", encoding="utf-8") as f:
    json.dump(geojson_final, f, ensure_ascii=False, indent=2)

print("=" * 80)
print(f"Arquivo salvo: {arquivo_saida}")
print(f"Total de supervisões no GeoJSON: {len(features)}")
print(f"Municípios sem match: {len(sem_match)}")
print(sorted(list(sem_match))[:30])
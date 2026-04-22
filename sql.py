import pandas as pd
import pyodbc

import pandas as pd
from sqlalchemy import create_engine

df = pd.read_csv("C:/Users/Igor/Downloads/olist_geolocation_dataset.csv")

server = 'DESKTOP-G4V6794'
database = 'TESTE'
username = 'sa'
password = 'expresso'

# string de conexão SQLAlchemy
engine = create_engine(
    f"mssql+pyodbc://{username}:{password}@{server}/{database}?driver=ODBC+Driver+17+for+SQL+Server&TrustServerCertificate=yes"
)

# agora sim funciona
df.to_sql("COORDENADAS_LOJAS", engine, if_exists="replace", index=False)

print("Agências importadas com sucesso!")
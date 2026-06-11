import requests

url = "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-100-mun.json"

r = requests.get(url)

with open("Brasil_Municipios.json", "wb") as f:
    f.write(r.content)

print("GeoJSON baixado com sucesso")
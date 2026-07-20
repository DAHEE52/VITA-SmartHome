from mangum import Mangum

from API_main import app

handler = Mangum(app)

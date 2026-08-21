"""Punto de entrada de la funcion serverless de Vercel.

Vercel busca una variable llamada `app`, `application` o `handler` en el nivel
superior de este archivo. La importacion debe quedar en el nivel superior y sin
envolverse en un try/except: si se anida, el analisis no la reconoce y el
despliegue falla con
"Could not find a top-level app, application, or handler".
"""

import os
import sys

# backend/ vive un nivel arriba de api/, hay que ponerlo en el path para poder
# importarlo. Se incluye en el paquete via includeFiles en vercel.json.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app

# Alias para cubrir cualquiera de los nombres que Vercel acepta.
application = app
handler = app

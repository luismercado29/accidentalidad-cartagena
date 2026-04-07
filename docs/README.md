# Documentación — CrashMap Cartagena

Carpeta con toda la documentación oficial del sistema.

## Documentos disponibles

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `1_informe_ejecutivo.md` | Informe ejecutivo del sistema para directivos y tomadores de decisión |
| 2 | `2_manual_usuario.md` | Manual de uso paso a paso para todos los tipos de usuario |
| 3 | `3_manual_programador.md` | Guía técnica para desarrolladores que mantengan o extiendan el sistema |
| 4 | `4_manual_api.md` | Referencia completa de todos los endpoints REST del backend |
| 5 | `5_ensayo.md` | Ensayo académico sobre el impacto del sistema en la seguridad vial |
| 6 | `6_documentacion_tecnica.md` | Especificación técnica: diagramas, modelos, flujos, seguridad |
| 7 | `7_guia_instalacion.md` | Instrucciones de instalación y despliegue en producción |

## Cómo leer estos documentos

Los archivos están en formato **Markdown** (.md). Puedes:

- **Leerlos directamente** en cualquier editor de texto
- **Abrirlos en VS Code** con preview (Ctrl+Shift+V)
- **Convertirlos a Word** usando Pandoc:
  ```bash
  pandoc 2_manual_usuario.md -o manual_usuario.docx
  ```
- **Convertirlos a PDF** usando Pandoc:
  ```bash
  pandoc 2_manual_usuario.md -o manual_usuario.pdf
  ```

## Instalar Pandoc (para convertir a Word/PDF)

Descargar desde: https://pandoc.org/installing.html

Comando para convertir todos los documentos a Word de una vez:
```bash
for f in *.md; do pandoc "$f" -o "${f%.md}.docx"; done
```

import subprocess
import os
from PIL import Image

mermaid_code = """
classDiagram
    direction LR

    class Department {
        +String name
        +String code
    }

    class Program {
        +String name
        +String degree
    }

    class Section {
        +String name
        +String code
        +String passkey
        +Int semester
    }

    class Course {
        +String code
        +String name
        +Int credits
        +Boolean is_lab
    }

    class Faculty {
        +String name
        +String email
        +Int max_load
    }

    class Room {
        +String name
        +String type
        +Int capacity
    }

    class TimetableEntry {
        +Int day
        +Int period
        +Int batch
    }

    class SubstitutionRequest {
        +Date date
        +String status
    }

    class SubstitutionCandidate {
        +Int priority
        +String status
    }

    Department "1" *-- "1..*" Program
    Program "1" *-- "1..*" Section
    Department "1" o-- "1..*" Faculty
    Department "1" o-- "1..*" Course
    Department "1" o-- "1..*" Room

    Section "1" --> "0..*" TimetableEntry : has
    Course "1" --> "0..*" TimetableEntry : taught_in
    Faculty "1" --> "0..*" TimetableEntry : teaches
    Room "1" --> "0..*" TimetableEntry : hosts

    TimetableEntry "1" --> "0..*" SubstitutionRequest : generates
    SubstitutionRequest "1" *-- "1..*" SubstitutionCandidate : invites
    Faculty "1" --> "0..*" SubstitutionCandidate : considers
"""

html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body {{
      background: white;
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: inline-block;
    }}
    .mermaid {{
      background: white;
    }}
  </style>
</head>
<body>
  <div class="mermaid">
{mermaid_code}
  </div>
  <script>
    mermaid.initialize({{
      startOnLoad: true,
      theme: 'neutral',
      themeVariables: {{
        primaryColor: '#F5F5F0',
        primaryTextColor: '#1C1917',
        primaryBorderColor: '#D97706',
        lineColor: '#78716C',
        secondaryColor: '#FFFBEB',
        tertiaryColor: '#FFFFFF'
      }}
    }});
  </script>
</body>
</html>
"""

with open("temp_render.html", "w", encoding="utf-8") as f:
    f.write(html_content)

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
cmd = [
    chrome,
    "--headless=new",
    "--virtual-time-budget=5000",
    "--screenshot=temp_render.png",
    "--window-size=1600,900",
    "temp_render.html"
]

res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
print("Chrome return code:", res.returncode)

if os.path.exists("temp_render.png"):
    im = Image.open("temp_render.png")
    print("Rendered successfully! Raw size:", im.size)
    # Autocrop whitespace
    bbox = im.getbbox()
    if bbox:
        im_cropped = im.crop(bbox)
        print("Cropped size:", im_cropped.size)
        im_cropped.save("temp_render_cropped.png")


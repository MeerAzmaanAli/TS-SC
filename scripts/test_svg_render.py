import subprocess
import os
from PIL import Image

svg_content = """<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="50" y="50" width="200" height="100" rx="8" fill="#FFFBEB" stroke="#D97706" stroke-width="2"/>
  <text x="150" y="90" font-family="Arial" font-size="16" font-weight="bold" fill="#1C1917" text-anchor="middle">Department</text>
  <text x="60" y="120" font-family="Arial" font-size="12" fill="#57534E">+UUID id</text>
  <text x="60" y="136" font-family="Arial" font-size="12" fill="#57534E">+String name</text>
</svg>"""

with open("test_svg.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)

cur_dir = os.path.abspath(".")
svg_path = os.path.join(cur_dir, "test_svg.svg")
png_path = os.path.join(cur_dir, "test_svg.png")
file_url = "file:///" + svg_path.replace("\\", "/")

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
cmd = [chrome, "--headless=new", f"--screenshot={png_path}", "--window-size=800,400", file_url]
res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

print("Code:", res.returncode)
print("PNG exists:", os.path.exists(png_path))
if os.path.exists(png_path):
    im = Image.open(png_path)
    print("Rendered PNG Size:", im.size)
    os.remove(png_path)
if os.path.exists("test_svg.svg"):
    os.remove("test_svg.svg")


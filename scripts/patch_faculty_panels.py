with open(r'd:\Meer Games\Major Project\TS-SC\frontend\src\pages\FacultyView.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('<div className="card"', '<div className="admin-panel"')
text = text.replace('<div className="card-header">', '<div className="admin-panel-hd">')
text = text.replace('<h2 className="card-title">', '<h2>')
text = text.replace('<h3 className="card-title">', '<h2>')
text = text.replace('</h3>', '</h2>')

with open(r'd:\Meer Games\Major Project\TS-SC\frontend\src\pages\FacultyView.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated card classes to admin-panel in FacultyView.tsx')


from PIL import Image, ImageDraw
from pathlib import Path
n=1024
im=Image.new('RGBA',(n,n),(0,0,0,0));d=ImageDraw.Draw(im)
d.rounded_rectangle((48,48,976,976),radius=208,fill='#123d43')
d.polygon([(260,760),(260,260),(376,260),(648,612),(648,260),(764,260),(764,760),(648,760),(376,408),(376,760)],fill='#78e4cb')
d.polygon([(680,112),(864,296),(744,296),(680,232)],fill='#e8fff8')
d.rounded_rectangle((260,834,764,854),radius=10,fill='#417b76')
im.save('resources/icon.png');im.save('resources/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

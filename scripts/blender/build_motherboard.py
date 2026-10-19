"""Reference-driven, articulated ATX motherboard. Run inside Blender through MCP.

All construction coordinates are millimetres; generated objects use metres.
Front: +Z, I/O: -X, EPS/top edge: +Y. No downloaded model or photo textures.
"""
import bpy
import math
import random
import json
from pathlib import Path
from collections import defaultdict
from mathutils import Vector

ROOT = Path('/Users/withoutmelv/work/3d-pc-builder')
OUT = ROOT / 'assets/motherboard'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(850)

# Use a separate scene, never clear a user's existing scene.
scene = bpy.data.scenes.new('Motherboard_Reference_Study')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'MILLIMETERS'
model = bpy.data.collections.new('01_Motherboard')
scene.collection.children.link(model)
studio = bpy.data.collections.new('02_Studio')
scene.collection.children.link(studio)
refs = bpy.data.collections.new('03_References_NOT_EXPORTED')
scene.collection.children.link(refs)
refs.hide_render = True

def material(name, color, metal=0, rough=.45, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    p = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(p.outputs['BSDF'], output.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'pcb': material('Soldermask · charcoal olive', (.025,.032,.026), .22,.47),
    'edge': material('FR4 · laminate edge', (.18,.16,.052), .1,.66),
    'black': material('Connector · moulded graphite', (.012,.015,.018), .04,.4),
    'rubber': material('Socket · dark polymer', (.028,.029,.028), .05,.57),
    'armor': material('Anodized aluminium · graphite', (.062,.071,.083), .78,.31),
    'facet': material('Anodized aluminium · cut facets', (.11,.126,.145), .75,.28),
    'silver': material('Nickel · retention hardware', (.49,.54,.59), .85,.26),
    'darkmetal': material('Brushed steel', (.16,.18,.20), .85,.35),
    'gold': material('Contact plating · muted gold', (.58,.39,.11), .8,.3),
    'white': material('Silkscreen · warm grey', (.46,.49,.47), .1,.63),
    'trace': material('PCB traces · subtle', (.065,.085,.066), .3,.5),
    'ceramic': material('SMD ceramic', (.18,.13,.085), .1,.55),
    'cyan': material('Accent · ice blue', (.07,.52,.7), .45,.28, .3),
    'purple': material('Accent · violet', (.30,.17,.51), .55,.26),
    'pad': material('Thermal pad · blue grey', (.19,.29,.34), 0,.85),
    'film': material('Peel liner · pale blue', (.39,.65,.73), .1,.22),
    'blue': material('USB · blue insert', (.018,.16,.32), .05,.35),
    'red': material('USB · red insert', (.30,.025,.02), .05,.38),
}
buffers = defaultdict(lambda: [[], []])
origins = {'Motherboard': (0,0,0)}
parents = {}
props = {}

def group(name, origin=(0,0,0), parent='Motherboard', **kwargs):
    origins[name] = origin
    parents[name] = parent
    props[name] = kwargs
    return name

def emit(g, mat, verts, faces):
    vs, fs = buffers[(g,mat)]
    n = len(vs)
    vs.extend(verts)
    fs.extend(tuple(n+i for i in f) for f in faces)

def poly(g, mat, pts, z, h):
    n = len(pts)
    v = [(x,y,z-h/2) for x,y in pts] + [(x,y,z+h/2) for x,y in pts]
    f = [tuple(reversed(range(n))), tuple(range(n,2*n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    emit(g,mat,v,f)

def box(g, mat, x,y,z,w,d,h, bevel=0):
    a,b,c,e = x-w/2,x+w/2,y-d/2,y+d/2
    q = min(bevel,w/3,d/3)
    pts = [(a+q,c),(b-q,c),(b,c+q),(b,e-q),(b-q,e),(a+q,e),(a,e-q),(a,c+q)] if q else [(a,c),(b,c),(b,e),(a,e)]
    poly(g,mat,pts,z,h)

def ring(g,mat,x,y,z,ro,ri,h,n=20):
    v=[]
    for zz,r in [(z-h/2,ro),(z+h/2,ro),(z-h/2,ri),(z+h/2,ri)]:
        v += [(x+r*math.cos(i*math.tau/n), y+r*math.sin(i*math.tau/n),zz) for i in range(n)]
    f=[]
    for i in range(n):
        j=(i+1)%n
        f += [(i,j,j+n,i+n),(i+2*n,i+3*n,j+3*n,j+2*n),(i+n,j+n,j+3*n,i+3*n),(i,i+2*n,j+2*n,j)]
    emit(g,mat,v,f)

def cyl(g,mat,x,y,z,r,h,n=16):
    poly(g,mat,[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n)) for i in range(n)],z,h)

def line(g,mat,points,r=.2,n=6):
    # Independent short cylinders keep bends robust for tiny metal traces.
    for a,b in zip(points,points[1:]):
        a,b=Vector(a),Vector(b)
        direction=(b-a).normalized()
        u=direction.cross(Vector((0,0,1)))
        if u.length<.01: u=direction.cross(Vector((0,1,0)))
        u.normalize();v=direction.cross(u)
        verts=[tuple(p+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for p in (a,b) for i in range(n)]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        emit(g,mat,verts,faces)

def screw(g,x,y,z,r=2):
    cyl(g,'silver',x,y,z,r,1,16)
    box(g,'darkmetal',x,y,z+.51,r*1.25,.45,.04)
    box(g,'darkmetal',x,y,z+.52,.45,r*1.25,.04)

texts=[]
def label(g,text,x,y,z,size=1.4,angle=0,mat='white'):
    texts.append((g,text,x,y,z,size,angle,mat))

# Board laminate; real mounting bores are cut after mesh creation.
group('PCB')
box('PCB','pcb',0,0,0,244,305,1.6,2.4)
box('PCB','edge',0,0,-.16,244.05,305.05,.22,2.4)
holes=[(-112,146),(-39,146),(117,146),(-112,-10),(45,-10),(117,-10),(-112,-142),(45,-142),(117,-142)]
group('Fixed_Detail')
for i,(x,y) in enumerate(holes):
    ring('Fixed_Detail','silver',x,y,.91,4.0,1.85,.18)
    ring('Fixed_Detail','silver',x,y,-.91,4.0,1.85,.18)
    for a in range(10):
        cyl('Fixed_Detail','gold',x+3.5*math.cos(a*math.tau/10),y+3.5*math.sin(a*math.tau/10),1.02,.22,.05,6)
    group(f'ANCHOR_mount_{i+1:02}',(x,y,0),kind='mounting_hole',bore_diameter_mm=3.7,confidence='estimated_from_reference')

# LGA socket body, exposed contact field, separate load plate and lever.
group('AM5_Socket', (7,62,0))
box('AM5_Socket','rubber',7,62,2.3,57,70,3,1.5)
box('AM5_Socket','black',7,62,4,42,42,.7,.4)
for row in range(32):
    for col in range(32):
        if 12<=row<20 and 12<=col<20: continue
        x=7+(col-15.5)*1.15;y=62+(row-15.5)*1.15
        box('AM5_Socket','gold',x,y,4.47,.36,.65,.2)
for x in [-12,26]:
    for y in [42,82]: box('AM5_Socket','rubber',x,y,4.8,3,1.8,1.2)
poly('AM5_Socket','gold',[(-15,86),(-11,86),(-15,82)],4.2,.12)
group('Socket_LoadPlate',(7,96,5),kind='hinge',axis='X',open_angle_degrees=-105)
for x in [-20,34]:box('Socket_LoadPlate','silver',x,62,5.4,5.6,65,1.7,1)
for y in [31,93]:box('Socket_LoadPlate','silver',7,y,5.4,56,6,1.7,1)
for x in [-16,30]:
    for y in [33,91]:screw('Socket_LoadPlate',x,y,6.6,2.6)
poly('Socket_LoadPlate','silver',[(0,26),(14,26),(18,31),(-4,31)],4.8,1.6)
line('AM5_Socket','darkmetal',[(-20,97,4),(34,97,4)],1.8,12)
group('Socket_Lever',(38,95,4),kind='hinge',axis='X',open_angle_degrees=-105)
line('Socket_Lever','silver',[(37,95,4),(38,89,5),(38,28,5),(32,23,5),(26,23,5)],1.05,12)
box('AM5_Socket','darkmetal',31,26,3.2,7,5,2,1)
group('ANCHOR_cpu',(7,62,4.6),kind='cpu',socket='AM5',alignment='triangle at -X,+Y')
label('AM5_Socket','AM5',2,25,4.3,2)

# Factory AMD cooler retention brackets. Backplate stays with board on AM5.
for name,y in [('Upper',110),('Lower',14)]:
    g=group('Cooler_Bracket_'+name,(7,y,1),kind='removable_bracket')
    box(g,'black',7,y,5.5,65,8,9,2)
    box(g,'black',7,y+(3 if y>62 else -3),9,12,6,6,1)
    for x in [-20,34]:
        s=group(f'Bracket_Screw_{name}_{x}',(x,y,10),kind='screw',parent=g)
        screw(s,x,y,10.1,3)
        group(f'ANCHOR_cooler_{name}_{x}',(x,y,2),kind='cooler_mount')
group('AM5_Backplate',(7,62,-2.8),kind='fixed_socket_backplate')
box('AM5_Backplate','silver',7,62,-2.7,66,100,2.6,5)
box('AM5_Backplate','black',7,62,-4.1,24,26,.15,1)
for x in [-20,34]:
    for y in [14,110]:
        ring('AM5_Backplate','darkmetal',x,y,-4.3,3.2,1.7,1)
for x,y in [(-12,80),(26,46),(-12,47),(26,79)]:cyl('AM5_Backplate','black',x,y,-4.1,2.6,.1)
for row in range(7):
    for col in range(7):box('AM5_Backplate','gold',-2+col*3,53+row*3,-4.21,1,1,.08)

# Four DIMMs: channels, offset key, contact comb, fixed upper retainers and lower clips.
for idx,x in enumerate([65,75,85,95]):
    name=['A1','A2','B1','B2'][idx]
    g=group('DIMM_'+name,(x,62,1),kind='memory_slot',recommended_pair=name in ['A2','B2'])
    box(g,'black',x,62,3.5,7,140,5,1)
    for dx in [-2.6,2.6]:box(g,'rubber',x+dx,62,8,1.8,137,7,.4)
    box(g,'black',x,62,6.1,2.5,133,.3)
    box(g,'rubber',x,55,8.2,3.2,2.2,5.2)
    for j in range(66):
        if abs((-1+j*1.92)-55)<2:continue
        for dx in [-1.45,1.45]:box(g,'gold',x+dx,-1+j*1.92,6.6,.45,.6,2)
    box(g,'rubber',x,133,7,7.5,6,10,1)
    clip=group('DIMM_Clip_'+name,(x,-8,4),kind='hinge',axis='X',open_angle_degrees=28)
    box(clip,'facet',x,-9,7.5,7.4,7,10,1)
    box(clip,'black',x,-7,12.5,4.7,5,2,.5)
    label(g,name,x-1.4,-17,1,1.7)
    group('ANCHOR_ram_'+name,(x,62,7),kind='ram',key_offset_mm=-7)

# Sculpted VRM heatsinks and tall integrated rear-I/O shroud.
group('VRM_Heatsinks')
poly('VRM_Heatsinks','armor',[(-91,20),(-50,15),(-43,32),(-43,112),(-62,134),(-91,145)],18,32)
poly('VRM_Heatsinks','armor',[(-47,124),(62,124),(62,146),(48,158),(-47,158)],18,32)
for i in range(12):
    box('VRM_Heatsinks','facet',-78+i*2.5,73,35,1.1,102,2)
for i in range(7):box('VRM_Heatsinks','black',5,126+i*3.8,35,101,1.15,.25)
for shift in [-20,-7,6]:
    poly('VRM_Heatsinks','facet',[(shift,124),(shift+9,124),(shift-15,158),(shift-24,158)],35.2,.5)
group('IO_Shroud',kind='integrated_io_shield')
poly('IO_Shroud','armor',[(-130,2),(-100,2),(-52,33),(-52,120),(-111,165),(-130,165)],31,23)
poly('IO_Shroud','black',[(-123,67),(-72,29),(-72,97),(-123,146)],43,.6)
poly('IO_Shroud','facet',[(-123,53),(-61,6),(-61,21),(-123,69)],43.8,1.5)
poly('IO_Shroud','facet',[(-123,155),(-64,110),(-64,119),(-123,168)],43.8,1.5)
for i in range(5):
    line('IO_Shroud','cyan',[(-114+i*2,112-i*3,44),(-100+i*2,108-i*3,44),(-84+i*2,92-i*3,44)],.5)
label('IO_Shroud','STRIX / AM5',-113,59,44,2.7,-math.pi/4)

# Rear panel: USB cavities, RJ45, HDMI/DP, audio and antenna connectors.
# Plane normal -X. Slots built as real hollow connector rims.
box('IO_Shroud','silver',-131,83,23,1.3,158,43)
box('IO_Shroud','black',-131.8,83,23,.4,155,40)
def io_rect(name,y,z,w,h,insert=None):
    g='Fixed_Detail'
    for yy in [y-w/2,y+w/2]:box(g,'silver',-132.3,yy,z,1.8,.7,h)
    for zz in [z-h/2,z+h/2]:box(g,'silver',-132.3,y,zz,1.8,w,.7)
    if insert:box(g,insert,-133,y,z-1,.7,w-2,1.5)
for y in [147,126,105,82]:
    for z in [13,24]:io_rect('USB',y,z,13,6,'blue' if y>110 else 'red')
io_rect('HDMI',147,34,15,5,'black')
io_rect('DisplayPort',126,34,15,5,'black')
io_rect('RJ45',59,18,15,14,'black')
for y in [58,42]:
    for z in [33]:
        line('Fixed_Detail','gold',[(-132,y,z),(-136,y,z)],2.1,16)
for y in [23,34]:
    for z in [13,25]:
        line('Fixed_Detail','silver',[(-132,y,z),(-134,y,z)],2.6,16)
        line('Fixed_Detail','black',[(-134,y,z),(-134.2,y,z)],1.5,16)

# PCIe sockets with asymmetric key and independent latches.
for idx,y in enumerate([-30,-134]):
    g=group('PCIe_'+str(idx+1),(-24,y,1),kind='pcie_slot')
    box(g,'black',-24,y,3.5,110,9,5,.7)
    for dy in [-3.4,3.4]:box(g,'silver' if idx==0 else 'rubber',-24,y+dy,7,110,1.3,5,.3)
    box(g,'rubber',-58,y,7,2,6,5)
    for j in range(75):
        for dy in [-1.7,1.7]:box(g,'gold',-76+j*1.4,y+dy,5.5,.65,.5,1)
    latch=group(f'PCIe_Latch_{idx+1}',(34,y,4),kind='latch',mechanism='simplified_reference_release')
    box(latch,'rubber',35,y,7,12,11,8,1)
    box(latch,'facet',39,y+4,11,10,6,2,1)
    group(f'ANCHOR_gpu_{idx+1}',(-24,y,6),kind='gpu')
    label(g,'PCIEX16_'+str(idx+1),-70,y-9,1,1.5)

# Four inferred M.2 positions below three removable covers. Hidden geometry is instructional.
for idx,(x,y) in enumerate([(-64,-7),(-56,-64),(-56,-104),(20,-71)]):
    g=group('M2_Socket_'+str(idx+1),(x+80,y,2),kind='m2_socket',confidence='hidden_layout_approximation')
    box(g,'black',x+80,y,3,7,24,4,.6)
    for dy in [-11,11]:box(g,'rubber',x+77,y+dy,5,7,2,3)
    box(g,'black',x+76,y,3.8,1,20,.7)
    box(g,'rubber',x+75.6,y+6,4.4,1.7,1.3,1.5)
    for j in range(19):box(g,'gold',x+76,y-9+j,4,.8,.35,.3)
    for length in [42,60,80]:
        xx=x+80-length
        ring(g,'silver',xx,y,2.2,2.1,1.1,2.8,12)
    q=group(f'M2_Q_Latch_{idx+1}',(x,y,3.7),kind='rotary_latch',axis='Z',open_angle_degrees=90)
    box(q,'rubber',x+2,y,4,6,3,1.3,.5)
    group(f'ANCHOR_m2_{idx+1}',(x+80,y,3.8),kind='m2',length_mm=80,insertion_angle_degrees=25)

covers = [
 ('M2_Cover_1',[(-94,4),(32,4),(32,-8),(21,-17),(-85,-17),(-94,-9)],8),
 ('M2_Cover_2',[(-106,-51),(32,-51),(76,-91),(-103,-91),(-106,-86)],6),
 ('M2_Cover_3',[(-107,-96),(98,-96),(114,-117),(110,-123),(-107,-123)],6),
]
for name,points,height in covers:
    g=group(name,(0,sum(y for x,y in points)/len(points),height),kind='removable_heatsink',removal_axis='Z')
    poly(g,'armor',points,height,5)
    y=sum(p[1] for p in points)/len(points)
    poly(g,'facet',[(points[0][0]+3,points[0][1]-2),(points[0][0]+35,points[0][1]-2),(points[0][0]+61,points[-2][1]+2),(points[0][0]+29,points[-2][1]+2)],height+2.6,.3)
    for i in range(7):
        xx=-64+i*18
        box(g,'black',xx,y-3+(i%3)*3,height+2.55,12,1.0,.12,.3)
    pad=group(name+'_ThermalPad',(0,y,height-3),parent=g,kind='thermal_pad')
    box(pad,'pad',-23,y,height-3,77,17,1,1)
    film=group(name+'_PeelFilm',(0,y,height-3.7),parent=g,kind='removable_protective_film')
    box(film,'film',-23,y,height-3.62,79,18,.16,.7)
    box(film,'film',20,y,height-3.62,8,7,.16,1)
    for side,x in [('L',points[0][0]+5),('R',points[1][0]-5)]:
        sg=group(name+'_Screw_'+side,(x,points[0][1]-4,height+3),parent=g,kind='screw')
        screw(sg,x,points[0][1]-4,height+3,1.7)
label('M2_Cover_1','M.2 / PCIe 5.0',-51,-4,10.7,2.3)

# Asymmetric right chipset armor, stepped stripe details.
group('Chipset_Armor')
poly('Chipset_Armor','armor',[(39,-23),(113,-23),(126,-49),(126,-89),(98,-96),(27,-37)],9,13)
poly('Chipset_Armor','facet',[(30,-32),(46,-26),(121,-86),(105,-92)],16,.4)
for i in range(10):
    y=-29-i*5.4
    for x in [78+(i%3)*3,108]:
        box('Chipset_Armor','black',x,y,15.7,14,1,.14,.3)
label('Chipset_Armor','B850',64,-55,16.5,7,-math.pi/4)
label('Chipset_Armor','NEO / SERIES',75,-66,16.5,1.8,-math.pi/4)

# 24-pin and EPS 8+8 connectors: hollow cells, asymmetric keys, latch ledges.
def power(g,x,y,rows,cols,vertical=False):
    pitch=4.2;w=cols*pitch;d=rows*pitch
    for a in range(cols):
        for b in range(rows):
            xx=x+(a-(cols-1)/2)*pitch; yy=y+(b-(rows-1)/2)*pitch
            if vertical:xx,yy=x+(b-(rows-1)/2)*pitch,y+(a-(cols-1)/2)*pitch
            box(g,'black',xx,yy,2.4,4.2,4.2,3)
            for dx in [-1.85,1.85]:box(g,'rubber',xx+dx,yy,7.2,.5,4.2,7)
            for dy in [-1.85,1.85]:box(g,'rubber',xx,yy+dy,7.2,4.2,.5,7)
            if (a+b)%2:poly(g,'rubber',[(xx-1.6,yy-1.6),(xx-.7,yy-1.6),(xx-1.6,yy-.7)],8,5)
            box(g,'gold',xx,yy,4.7,.8,.8,2.2)
    box(g,'rubber',x+(5.2 if vertical else 0),y+(0 if vertical else -5.2),6,2 if vertical else 8,8 if vertical else 2,4)
group('ATX_24PIN',(115,58,1),kind='power_header')
power('ATX_24PIN',115,58,2,12,True)
group('ANCHOR_atx24',(115,58,10.5),kind='atx24')
for idx,x in enumerate([-75,-55]):
    g=group(f'EPS_8PIN_{idx+1}',(x,148,1),kind='power_header')
    power(g,x,148,2,4)
    group(f'ANCHOR_eps_{idx+1}',(x,148,10.5),kind='eps8')

# Board headers, missing-pin keying and fan guide tabs.
def header(name,x,y,cols=4,rows=1,missing=None,shroud=False):
    g=group(name,(x,y,1),kind='header',missing_pin=str(missing))
    w=cols*2.54+1;d=rows*2.54+1
    box(g,'black',x,y,2,w,d,2,.3)
    for a in range(cols):
        for b in range(rows):
            if (a,b)==missing:continue
            box(g,'gold',x+(a-(cols-1)/2)*2.54,y+(b-(rows-1)/2)*2.54,4.5,.6,.6,4)
    if rows==1:box(g,'rubber',x,y+2,4,6,1,5)
    if shroud:
        for yy in [y-d/2-1,y+d/2+1]:box(g,'black',x,yy,4,w+2,1,5)
    label(g,name,x-w/2,y-d/2-3,1,1.35)
    group('ANCHOR_'+name,(x,y,5),kind='header')
header('CPU_FAN',74,142)
header('CPU_OPT',91,142)
header('AIO_PUMP',113,118)
header('CHA_FAN1',112,16)
header('CHA_FAN2',-63,-146)
header('CHA_FAN3',37,-147)
header('F_PANEL',99,-147,10,2,(9,1))
header('USB_2_A',-25,-147,5,2,(4,1),True)
header('USB_2_B',-7,-147,5,2,(4,1),True)
header('USB_2_C',12,-147,5,2,(4,1),True)
header('HD_AUDIO',-93,-147,5,2,(3,1),True)
header('ARGB_5V',53,-147,4,1,(2,0))
header('USB_3_HEADER',111,24,10,2,(9,1),True)
group('USB_C_Header')
box('USB_C_Header','silver',111,-7,4,9,14,6,1)
box('USB_C_Header','black',111,-7,7.1,5,10,.2,1)
label('USB_C_Header','USB-C',106,-18,1,1.4)
for i in range(2):
    g=group('SATA_'+str(i+1),(117,-54-i*14,1),kind='sata_right_angle')
    box(g,'black',118,-54-i*14,6,15,12,10,1)
    box(g,'darkmetal',125.55,-54-i*14,6,.2,9,5)
    box(g,'black',125.7,-54-i*14,6,.2,7,3)
    group('ANCHOR_sata_'+str(i+1),(126,-54-i*14,6),kind='sata',direction='+X')

# VRM phases, capacitors, audio island, CMOS battery.
for i in range(12):
    y=24+i*8
    cyl('Fixed_Detail','darkmetal',-38,y,5,2.4,7,12)
    cyl('Fixed_Detail','silver',-38,y,8.55,2.1,.16,12)
for i in range(10):
    x=-25+i*8
    box('Fixed_Detail','darkmetal',x,119,4,6,5,5,.5)
for x,y in [(-105,-129),(-96,-129),(-105,-139),(-96,-139),(-106,-118)]:
    cyl('Fixed_Detail','gold',x,y,4,2.6,6)
    cyl('Fixed_Detail','silver',x,y,7.1,2.3,.2)
group('CMOS_Battery')
cyl('CMOS_Battery','black',78,-135,2,11,2.5,32)
cyl('CMOS_Battery','silver',78,-135,3.6,9.8,1.5,32)
box('CMOS_Battery','darkmetal',78,-126,5,5,5,1,.5)
label('CMOS_Battery','CR2032',71,-135,4.45,2)
label('CMOS_Battery','+',77,-139,4.45,2.5)
for i,color in enumerate(['red','gold','white','cyan']):
    box('Fixed_Detail','black',116,102-i*3,2,3,2,2)
    box('Fixed_Detail',color,116,102-i*3,3.1,1.4,1,.2)
label('Fixed_Detail','CPU DRAM VGA BOOT',121,77,1,1,math.pi/2)

# Controlled PCB detail, on exposed front areas; backside traces and solder pads.
def blocked(x,y):
    return (x<-45 and y>5) or (-24<x<43 and 20<y<103) or (60<x<101 and -12<y<136) or (-50<x<64 and y>120) or (-108<x<115 and -124<y<-46) or (26<x<128 and -97<y<-22)
for i in range(600):
    x=random.uniform(-116,116);y=random.uniform(-148,148)
    if blocked(x,y) or any((x-hx)**2+(y-hy)**2<35 for hx,hy in holes):continue
    w=random.uniform(.9,2.6);d=random.choice([.7,1.0,1.5])
    box('Fixed_Detail','ceramic' if i%4==0 else 'black',x,y,1.3,w,d,.8)
    for dx in [-w/2,w/2]:box('Fixed_Detail','silver',x+dx,y,1.35,.35,d,.85)
for i in range(210):
    x=random.uniform(-114,114);y=random.uniform(-146,146)
    if any((x-hx)**2+(y-hy)**2<25 for hx,hy in holes):continue
    length=random.uniform(3,15)
    line('Fixed_Detail','trace',[(x,y,-.88),(x,y+length/2,-.88),(x+length/3,y+length*.8,-.88)],.10,4)
    cyl('Fixed_Detail','silver',x,y,-.95,.36,.12,6)
for x in [65,75,85,95]:
    for y in range(-3,130,2):
        for dx in [-1.5,1.5]:cyl('Fixed_Detail','silver',x+dx,y,-1,.36,.2,6)
for i in range(56):
    # Broken diagonal silkscreen motif, following the reference's lower half.
    row=i//8; col=i%8
    x=-105+col*25+(row%2)*6; y=-129+row*14+col*2.3
    line('Fixed_Detail','white',[(x,y,-1),(x+random.uniform(9,20),y,-1)],.38,6)
for i in range(920):
    x=random.uniform(-115,115);y=random.uniform(-148,148)
    if (-28<x<43 and 10<y<114) or any((x-hx)**2+(y-hy)**2<28 for hx,hy in holes):continue
    if i%4==0:
        box('Fixed_Detail','black',x,y,-1.08,1.4,.8,.3)
        for dx in [-.7,.7]:box('Fixed_Detail','silver',x+dx,y,-1.12,.24,.7,.35)
    else:cyl('Fixed_Detail','silver',x,y,-1.03,.23,.18,6)
for i in range(72):
    x=40+i*.85; y=48+(i%8)*6
    line('Fixed_Detail','trace',[(x,y,-.91),(x,-17-i*.65,-.91),(x-23,-40-i*.65,-.91),(x-43,-40-i*.65,-.91)],.075,4)
line('Fixed_Detail','gold',[(-115,-150,1),(-115,-75,1),(-111,-71,1),(-111,-45,1)],.22)
label('Fixed_Detail','AM5  /  DDR5  /  ATX',-74,-42,1,2)
label('Fixed_Detail','B850-F  ·  REFERENCE STUDY',-85,-126,1,1.8)

# Instantiate batched meshes. Separate articulated groups survive GLB export.
objects={}
for name,origin in origins.items():
    o=bpy.data.objects.new(name,None);model.objects.link(o)
    o.empty_display_type='PLAIN_AXES';o.empty_display_size=.004
    o.location=Vector(origin)*.001
    for k,v in props.get(name,{}).items():o[k]=v
    objects[name]=o
for name,parent in parents.items():
    o=objects[name];origin=o.location.copy();o.parent=objects[parent]
    o.location=origin-Vector(origins[parent])*.001
for (g,mat),(verts,faces) in buffers.items():
    origin=Vector(origins[g])
    mesh=bpy.data.meshes.new(g+'__'+mat)
    mesh.from_pydata([tuple((Vector(v)-origin)*.001) for v in verts],[],faces)
    mesh.materials.append(M[mat]);mesh.update()
    o=bpy.data.objects.new(g+'__'+mat,mesh);model.objects.link(o);o.parent=objects[g]
    # Recalculate consistent normals, including hollow connector walls.
    import bmesh
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()

# Cut holes through PCB rather than painting discs on top.
for o in list(model.objects):
    if o.type=='MESH' and o.parent==objects['PCB']:
        bpy.context.view_layer.objects.active=o
        for x,y in holes:
            bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.00185,depth=.008,location=(x*.001,y*.001,0))
            cutter=bpy.context.object
            mod=o.modifiers.new('Through mounting bore','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
            bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter,do_unlink=True)

# Backplate window and tooling holes are real openings in the metal plate.
backmetal=next(o for o in model.objects if o.name.startswith('AM5_Backplate__silver'))
for x,y,w,d in [(7,62,24,26),(-12,80,5,5),(26,46,5,5),(-12,47,5,5),(26,79,5,5)]:
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x*.001,y*.001,-.0027))
    cutter=bpy.context.object;cutter.dimensions=(w*.001,d*.001,.02)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=backmetal.modifiers.new('Backplate opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.context.view_layer.objects.active=backmetal;bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

for g,text,x,y,z,size,angle,mat in texts:
    data=bpy.data.curves.new('Silkscreen '+text,'FONT');data.body=text;data.size=size*.001
    data.extrude=0;data.resolution_u=2;data.materials.append(M[mat])
    o=bpy.data.objects.new('Label '+text,data);model.objects.link(o)
    o.parent=objects[g];o.location=(Vector((x,y,z))-Vector(origins[g]))*.001;o.rotation_euler.z=angle
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH')

# Pack reference images for inspection, kept out of export and renders.
for idx,name in enumerate(['front','back','oblique']):
    img=bpy.data.images.load(str(OUT/'reference'/f'{name}.png'));img.pack()
    o=bpy.data.objects.new('REFERENCE_'+name,None);refs.objects.link(o)
    o.empty_display_type='IMAGE';o.data=img;o.empty_display_size=.35
    o.location=(.43+idx*.38,0,0);o.hide_render=True
refs.hide_viewport=True

objects['Motherboard']['reference']='User supplied front/back/oblique images; B850-F NEO style'
objects['Motherboard']['dimensions_mm']='PCB 244 x 305 x 1.6; heights and hidden geometry estimated'
objects['Motherboard']['assembly_notes']='Independent actions; no forced sequence. Mechanical obstruction only.'
objects['Motherboard']['source_axes']='Blender +Z front, -X rear IO, +Y top; glTF +Y front, -Z top'
objects['Motherboard']['status']='Reference reconstruction, not manufacturer CAD; not yet integrated in web app'

# Studio for consistent orthographic and oblique reviews.
world=bpy.data.worlds.new('Studio charcoal');world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.15,.18,.23,1)
background.inputs[1].default_value=.45;scene.world=world
def area(name,pos,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key · broad softbox',(-.2,.15,.4),14,.35,(.84,.91,1))
area('Fill · neutral',(.3,-.05,.25),10,.28,(1,.92,.84))
area('Rim · cool',(.05,-.3,.1),7,.2,(.55,.73,1))
area('Under · inspection',(.1,.2,-.35),10,.3,(.88,.92,1))
d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);studio.objects.link(cam);scene.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=.47;cam.data.lens=50;cam.data.clip_start=.001;cam.data.clip_end=10
cam.location=(-.32,-.39,.48);cam.rotation_euler=(Vector((0,0,.012))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'previews'/'hero.png')
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.clip_start=.001
            a.spaces.active.clip_end=100
            a.spaces.active.region_3d.view_distance=.49
            a.spaces.active.region_3d.view_location=(0,0,.01)
            a.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            a.spaces.active.overlay.show_extras=False
            a.spaces.active.shading.type='MATERIAL'

# Export only model; references and studio are excluded.
bpy.ops.object.select_all(action='DESELECT')
for o in model.objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects['Motherboard']
bpy.ops.export_scene.gltf(filepath=str(OUT/'motherboard.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
stats={'mesh_objects':sum(o.type=='MESH' for o in model.objects),'groups':len(origins),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in model.objects if o.type=='MESH'),'glb_bytes':(OUT/'motherboard.glb').stat().st_size,'anchors':{n:list(origins[n]) for n in origins if n.startswith('ANCHOR_')}}
(OUT/'model-manifest.json').write_text(json.dumps(stats,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'motherboard.blend'))
print('MODEL_READY',json.dumps({k:v for k,v in stats.items() if k!='anchors'}))

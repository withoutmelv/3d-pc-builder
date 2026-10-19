"""Create a reference-derived AM5 CPU inside Blender through blender-mcp.
Dimensions are construction estimates in mm, exported in metres.
"""
import bpy, math, random, json, bmesh
from pathlib import Path
from mathutils import Vector
from collections import defaultdict

OUT=Path('/Users/withoutmelv/work/3d-pc-builder/assets/cpu')
scene=bpy.data.scenes.new('CPU_9800X3D_Reference')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='MILLIMETERS'
collection=bpy.data.collections.new('CPU_Model');scene.collection.children.link(collection)
studio=bpy.data.collections.new('CPU_Studio');scene.collection.children.link(studio)
root=bpy.data.objects.new('CPU_9800X3D',None);collection.objects.link(root)
root['socket']='AM5'
root['reference_accuracy']='40 mm construction footprint; thickness and contact pattern approximated from supplied image'
root['orientation']='Blender +Z lid, triangle -X +Y; glTF +Y lid, triangle -X -Z'
root['assembly']='Treat entire CPU as one part; substrate, IHS and contact pads are not user-removable'
root['thermal_surface_z_mm']=3.25

def mat(name,col,metal=0,rough=.45):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*col,1)
 nodes=m.node_tree.nodes;nodes.clear();p=nodes.new('ShaderNodeBsdfPrincipled');o=nodes.new('ShaderNodeOutputMaterial')
 p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 m.node_tree.links.new(p.outputs['BSDF'],o.inputs['Surface']);return m
M={
 'substrate':mat('CPU · teal soldermask',(.007,.066,.073),.18,.45),
 'edge':mat('CPU · laminate edge',(.015,.034,.027),.05,.6),
 'metal':mat('CPU · nickel heat spreader',(.56,.57,.52),.9,.34),
 'flange':mat('CPU · nickel flange',(.36,.38,.34),.82,.46),
 'gold':mat('CPU · contact gold',(.67,.47,.13),.78,.3),
 'ink':mat('CPU · laser markings',(.018,.022,.023),.3,.7),
 'ceramic':mat('CPU · capacitor ceramic',(.24,.22,.13),.05,.65),
 'solder':mat('CPU · solder terminations',(.44,.48,.46),.8,.3),
 'black':mat('CPU · adhesive seam',(.009,.014,.014),0,.65),
}
buffers=defaultdict(lambda:[[],[]])
def poly(name,material,pts,z,h):
 vs,fs=buffers[(name,material)];base=len(vs);n=len(pts)
 vs.extend([(x*.001,y*.001,(z-h/2)*.001) for x,y in pts]+[(x*.001,y*.001,(z+h/2)*.001) for x,y in pts])
 fs.extend([tuple(base+i for i in reversed(range(n))),tuple(base+i for i in range(n,2*n))])
 fs.extend([(base+i,base+(i+1)%n,base+(i+1)%n+n,base+i+n) for i in range(n)])
def box(name,material,x,y,z,w,d,h,c=0):
 a,b=x-w/2,x+w/2;lo,hi=y-d/2,y+d/2
 pts=[(a+c,lo),(b-c,lo),(b,lo+c),(b,hi-c),(b-c,hi),(a+c,hi),(a,hi-c),(a,lo+c)] if c else [(a,lo),(b,lo),(b,hi),(a,hi)]
 poly(name,material,pts,z,h)
box('Substrate','substrate',0,0,0,40,40,1.1,.22)
box('Substrate_Edge','edge',0,0,-.05,40.03,40.03,.17,.22)
# Eight recesses around the characteristic AM5 heat-spreader outline.
outline=[(-18.8,11.8),(-18.8,15.6),(-17.7,17.7),(-15.6,18.8),(-12.2,18.8),
 (-12.2,14.5),(-2,14.5),(-2,18.8),(2,18.8),(2,14.5),(12.2,14.5),(12.2,18.8),
 (15.6,18.8),(17.7,17.7),(18.8,15.6),(18.8,11.8),(14.5,11.8),(14.5,3.7),
 (18.8,3.7),(18.8,-3.7),(14.5,-3.7),(14.5,-11.8),(18.8,-11.8),(18.8,-15.6),
 (17.7,-17.7),(15.6,-18.8),(12.2,-18.8),(12.2,-14.5),(2,-14.5),(2,-18.8),
 (-2,-18.8),(-2,-14.5),(-12.2,-14.5),(-12.2,-18.8),(-15.6,-18.8),(-17.7,-17.7),
 (-18.8,-15.6),(-18.8,-11.8),(-14.5,-11.8),(-14.5,-3.7),(-18.8,-3.7),(-18.8,3.7),
 (-14.5,3.7),(-14.5,11.8)]
poly('IHS_Adhesive','black',[(x*.985,y*.985) for x,y in outline],.67,.18)
poly('IHS_Flange','flange',outline,1.04,.62)
poly('IHS_Top','metal',[(x*.95,y*.95) for x,y in outline],2.29,1.92)
# Separate corner datum is visible from both sides, mirrored by viewing direction.
tri=[(-19.45,19.45),(-17.3,19.45),(-19.45,17.3)]
poly('Alignment_Triangles','gold',tri,.57,.04)
poly('Alignment_Triangles','gold',tri,-.58,.04)
random.seed(9800)
# Passives sit on the exposed board inside the metal recesses.
for side in [-1,1]:
 for center in [-7.7,7.7]:
  for i in range(3):
   for j in range(4):
    x=side*(15.5+i*.85);y=center+(j-1.5)*1.05
    box('Top_Passives','ceramic',x,y,.94,.6,.8,.65,.06)
    for dy in [-.34,.34]:box('Top_Passives','solder',x,y+dy,.94,.63,.2,.67)
for side in [-1,1]:
 for center in [-7.1,7.1]:
  for i in range(5):
   for j in range(2):
    x=center+(i-2)*1.15;y=side*(15.8+j*1.25)
    box('Top_Passives','ceramic',x,y,.94,.8,.64,.65,.06)
    for dx in [-.34,.34]:box('Top_Passives','solder',x+dx,y,.94,.2,.67,.67)
# Flat LGA pads, not PGA pins. Grid is a visual reconstruction, not pin mapping.
pad_count=0
for row in range(43):
 for col in range(40):
  x=(col-19.5)*.93+(row%2)*.17;y=(row-21)*.83
  if abs(x)>17.5 and abs(y)>16.5:continue
  if abs(x)<2.15 and abs(y)>16.45:continue
  box('LGA_Contact_Array','gold',x,y,-.61,.59,.67,.10,.065);pad_count+=1

meshes={}
for (name,material),(vs,fs) in buffers.items():
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.materials.append(M[material]);mesh.update()
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(name+'__'+material,mesh);collection.objects.link(o);o.parent=root;meshes[name+'__'+material]=o
 if name.startswith('IHS') and name!='IHS_Adhesive':
  bevel=o.modifiers.new('Rounded nickel edges','BEVEL');bevel.width=.00028;bevel.segments=4
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
  for p in mesh.polygons:p.use_smooth=True
  normal=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
  bpy.ops.object.modifier_apply(modifier=normal.name)

# Semicircular upper/lower keying notches pass through the substrate layers.
for name in ['Substrate__substrate','Substrate_Edge__edge']:
 o=meshes[name]
 for y in [-20,20]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.0012,depth=.005,location=(0,y*.001,0))
  cutter=bpy.context.object
  mod=o.modifiers.new('Substrate locating notch','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  bpy.data.objects.remove(cutter,do_unlink=True)

font_path=Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
font=bpy.data.fonts.load(str(font_path)) if font_path.exists() else None
def text(body,x,y,size,name,bold=False):
 data=bpy.data.curves.new(name,'FONT');data.body=body;data.size=size*.001;data.resolution_u=4
 if bold and font:data.font=font
 data.materials.append(M['ink']);o=bpy.data.objects.new(name,data);collection.objects.link(o);o.parent=root
 o.location=(x*.001,y*.001,.003257)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
text('AMD',-11.3,7.2,5.9,'Engraving_AMD',True)
text('RYZEN',-11.3,2.5,4.35,'Engraving_RYZEN',True)
text('AMD Ryzen 7 9800X3D',-11.1,-1.6,1.58,'Engraving_Model',True)
text('100-000001084\nCF 2428PGY\nF411260U40104\nMADE IN MALAYSIA\n© 2024 AMD',-3.65,-5.2,.96,'Engraving_Reference_Text')
text('D',-3.65,-11.9,.95,'Engraving_D')
# Reference-inspired arrow symbol and non-scannable matrix marking.
poly('Marking_Arrow','ink',[(2.7,11.6),(7.1,11.6),(7.1,7.2),(5.8,8.5),(5.8,10.3),(4,10.3)],3.26,.006)
poly('Marking_Arrow','ink',[(2.7,7.2),(5.8,7.2),(4.5,8.5),(4,8.5),(4,9.0),(2.7,10.3)],3.26,.006)
for r in range(18):
 for c in range(18):
  if c==0 or r==0 or (c==17 and r%2==0) or (r==17 and c%2==0) or (0<c<17 and 0<r<17 and random.random()<.48):
   box('Matrix_Visual_Marking','ink',-11+c*.32,-10.5+r*.32,3.26,.3,.3,.006)
# Instantiate marking buffers added after the core geometry.
for (name,material),(vs,fs) in buffers.items():
 if not name.startswith(('Marking_','Matrix_')):continue
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.materials.append(M[material]);mesh.update()
 o=bpy.data.objects.new(name,mesh);collection.objects.link(o);o.parent=root

for name,xyz in [('ANCHOR_CPU_SEAT',(0,0,-.66)),('ANCHOR_THERMAL_CONTACT',(0,0,3.25)),('ANCHOR_ORIENTATION_TRIANGLE',(-18.8,18.8,.58))]:
 o=bpy.data.objects.new(name,None);collection.objects.link(o);o.parent=root;o.location=Vector(xyz)*.001;o.empty_display_size=.001

# Keep the supplied image in the blend as a reference, never map it onto the model.
refs=bpy.data.collections.new('CPU_Reference_NOT_EXPORTED');scene.collection.children.link(refs)
img=bpy.data.images.load(str(OUT/'reference/front-back.jpg'));img.pack()
o=bpy.data.objects.new('REFERENCE_front_back',None);refs.objects.link(o);o.empty_display_type='IMAGE';o.data=img;o.empty_display_size=.12;o.location=(.1,0,0);o.hide_render=True;refs.hide_viewport=True

world=bpy.data.worlds.new('CPU Studio world');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.025,.036,.048,1);bg.inputs[1].default_value=.4
def light(name,pos,power,size,color):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
 o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=pos;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
light('Broad key',(-.04,.045,.10),1.0,.1,(1,.94,.82))
light('Soft fill',(.055,-.035,.06),.6,.07,(.68,.83,1))
light('Back inspection',(-.015,.03,-.085),.8,.1,(1,.95,.84))
data=bpy.data.cameras.new('CPU Camera');cam=bpy.data.objects.new('CPU Camera',data);studio.objects.link(cam);scene.camera=cam
data.type='ORTHO';data.ortho_scale=.063;data.clip_start=.0001;data.clip_end=10
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.4
def camera(pos):
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.001))-cam.location).to_track_quat('-Z','Y').to_euler()
camera((-.048,-.063,.085))

bpy.ops.object.select_all(action='DESELECT')
for o in collection.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'cpu-9800x3d.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
stats={'socket':'AM5','construction_footprint_mm':[40,40],'substrate_thickness_mm':1.1,'thermal_top_z_mm':3.25,'contact_bottom_z_mm':-.66,'visual_contact_count':pad_count,'contact_pattern':'approximation, not an electrical pin map','triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in collection.objects if o.type=='MESH'),'mesh_objects':sum(o.type=='MESH' for o in collection.objects),'gltf_axes':'+X right, -Z top, +Y lid','glb_bytes':(OUT/'cpu-9800x3d.glb').stat().st_size}
(OUT/'model-manifest.json').write_text(json.dumps(stats,indent=2))
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   s=area.spaces.active;s.clip_start=.0001;s.region_3d.view_distance=.07;s.region_3d.view_location=(0,0,.001);s.region_3d.view_rotation=cam.rotation_euler.to_quaternion();s.shading.type='MATERIAL';s.overlay.show_extras=False;s.overlay.show_floor=False
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'cpu-9800x3d.blend'))
print('CPU_MODEL_READY',json.dumps(stats))

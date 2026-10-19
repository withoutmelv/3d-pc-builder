"""Render and verify the CPU scene without modifying the assembly website."""
import bpy,math,json,bmesh
from pathlib import Path
from mathutils import Vector
OUT=Path('/Users/withoutmelv/work/3d-pc-builder/assets/cpu')
scene=bpy.context.scene
model=next(c for c in scene.collection.children if c.name.startswith('CPU_Model'))
for o in model.objects:
 if o.type!='MESH':continue
 for slot in o.material_slots:
  if slot.material is None:slot.material=o.data.materials[0]
 for m in o.data.materials:
  p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  if m.name.startswith('CPU · teal'):
   p.inputs['Base Color'].default_value=(.003,.028,.037,1)
   p.inputs['Specular IOR Level'].default_value=.15
  if m.name.startswith('CPU · laser'):
   p.inputs['Base Color'].default_value=(.002,.003,.004,1)
   p.inputs['Metallic'].default_value=0
   p.inputs['Specular IOR Level'].default_value=.05
scene.view_settings.exposure=-.8
for o in model.objects:
 if o.type=='MESH' and o.name.startswith(('Marking_','Matrix_')):
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
cam=scene.camera
for name,pos in [('hero',(-.048,-.063,.085)),('front',(0,0,.1)),('back',(0,0,-.1)),('edge',(0,-.1,.018))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.001))-cam.location).to_track_quat('-Z','Y').to_euler()
 if name=='back':cam.rotation_euler=(math.pi,0,math.pi)
 cam.data.ortho_scale=.063 if name=='hero' else .048
 scene.render.filepath=str(OUT/'previews'/f'{name}.png')
 bpy.ops.render.render(write_still=True)
 print('RENDERED',name,flush=True)
cam.location=(-.048,-.063,.085);cam.rotation_euler=(Vector((0,0,.001))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.063
bpy.ops.object.select_all(action='DESELECT')
for o in model.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'cpu-9800x3d.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
manifest=json.loads((OUT/'model-manifest.json').read_text());manifest['glb_bytes']=(OUT/'cpu-9800x3d.glb').stat().st_size
(OUT/'model-manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'cpu-9800x3d.blend'))
print('CPU_REVIEW_COMPLETE')

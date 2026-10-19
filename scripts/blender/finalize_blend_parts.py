"""Reopen isolated scene libraries and save normal, framed Blender documents.
Run with Blender --background --python scripts/blender/finalize_blend_parts.py.
No geometry is modified; model construction happens through the MCP bridge.
"""
import bpy, json
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[2]/'assets'
for key in ['ram','ssd','gpu','cooler','psu','case']:
 path=root/key/(key+'.blend')
 bpy.ops.wm.open_mainfile(filepath=str(path))
 assert len(bpy.data.scenes)==1,key
 scene=bpy.data.scenes[0]
 assert bpy.data.objects.get(key+'_ROOT'),key
 assert scene.camera,key
 bpy.context.window.scene=scene
 model=[o for o in scene.objects if o.type=='MESH']
 points=[o.matrix_world@Vector(v) for o in model for v in o.bound_box]
 low=Vector(tuple(min(v[i] for v in points) for i in range(3)))
 high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
 for o in scene.objects:
  if o.type in ['LIGHT','CAMERA']:o.hide_set(True)
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type!='VIEW_3D':continue
   space=area.spaces.active;space.clip_start=.0001;space.clip_end=100
   space.shading.type='MATERIAL';space.region_3d.view_location=(low+high)/2
   space.region_3d.view_distance=max(high-low)*2
   space.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(path))
 result_path=root/key/'validation.json'
 result=json.loads(result_path.read_text());result['blendReopened']=True;result['blendStandardDocument']=True
 result_path.write_text(json.dumps(result,indent=2)+'\n')
 print('BLEND_VALID',key,len(scene.objects),flush=True)

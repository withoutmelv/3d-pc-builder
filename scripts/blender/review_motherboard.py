"""Refine studio/materials, render closed/open/back views, save the closed asset."""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

OUT=Path('/Users/withoutmelv/work/3d-pc-builder/assets/motherboard')
scene=bpy.context.scene
model=next(c for c in scene.collection.children if c.name.startswith('01_Motherboard'))
objects={o.name:o for o in model.objects if o.type=='EMPTY'}
root=next(o for o in objects.values() if o.name.startswith('Motherboard'))
def find(name):
    return next(o for o in model.objects if o.name==name or o.name.startswith(name+'.'))

# Reduce the silvery appearance; retain separation of black polymer and aluminium.
colors={
 'Soldermask':(.006,.009,.007),
 'Anodized aluminium · graphite':(.017,.021,.028),
 'Anodized aluminium · cut facets':(.038,.046,.056),
 'Connector':(.005,.007,.009),
 'Socket':(.012,.014,.015),
 'PCB traces':(.028,.041,.03),
}
used={mat for o in model.objects if o.type=='MESH' for mat in o.data.materials if mat}
for mat in used:
    for prefix,col in colors.items():
        if mat.name.startswith(prefix):
            p=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            p.inputs['Base Color'].default_value=(*col,1);mat.diffuse_color=(*col,1)
            if prefix.startswith('Anodized'):p.inputs['Roughness'].default_value=.42
scene.view_settings.exposure=-.7
background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.035,.045,.064,1)
background.inputs[1].default_value=.35

# Fine edge bevels on the large covers are geometry in both Blender and glTF.
for o in list(model.objects):
    if o.type=='MESH' and o.parent and any(o.parent.name.startswith(p) for p in ['M2_Cover_','Chipset_Armor','VRM_Heatsinks','IO_Shroud']):
        if '__armor' not in o.name and '__facet' not in o.name:continue
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Machined edge highlights','BEVEL');mod.width=.00032;mod.segments=2
        mod.limit_method='ANGLE';mod.angle_limit=.5
        bpy.ops.object.modifier_apply(modifier=mod.name)

cam=scene.camera
def render(name,pos,target=(0,0,.006),scale=.425):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    if name=='back':cam.rotation_euler=(math.pi,0,math.pi)
    cam.data.ortho_scale=scale
    scene.render.filepath=str(OUT/'previews'/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED',name,flush=True)

render('hero',(-.32,-.39,.48),scale=.44)
render('front',(0,0,.55),scale=.375)
render('back',(0,0,-.55),scale=.375)

# Demonstrate real separable meshes and usable pivots, then restore closed state.
original={o:o.matrix_basis.copy() for o in model.objects}
find('Socket_LoadPlate').rotation_euler.x=math.radians(-105)
find('Socket_Lever').rotation_euler.x=math.radians(-105)
for name in ['A1','A2','B1','B2']:
    find('DIMM_Clip_'+name).rotation_euler.x=math.radians(28)
for i in [1,2,3]:
    find(f'M2_Cover_{i}').location.z+=.065
    find(f'M2_Cover_{i}_PeelFilm').location.z-=.018
    for side in ['L','R']:find(f'M2_Cover_{i}_Screw_{side}').location.z+=.012
render('exploded',(-.29,-.43,.56),target=(0,0,.04),scale=.45)
for o,matrix in original.items():o.matrix_basis=matrix

cam.location=(-.32,-.39,.48);cam.rotation_euler=(Vector((0,0,.006))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.44
scene.render.filepath=str(OUT/'previews'/'hero.png')
bpy.ops.object.select_all(action='DESELECT')
for o in model.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'motherboard.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
manifest=json.loads((OUT/'model-manifest.json').read_text())
manifest.update({'mesh_objects':sum(o.type=='MESH' for o in model.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in model.objects if o.type=='MESH'),'glb_bytes':(OUT/'motherboard.glb').stat().st_size,'unit':'metre','blender_axes':'+X right, +Y top, +Z component side','gltf_axes':'+X right, -Z top, +Y component side','anchors_unit':'millimetre in Blender coordinates','review_images':['hero.png','front.png','back.png','exploded.png']})
(OUT/'model-manifest.json').write_text(json.dumps(manifest,indent=2))
# Show the asset cleanly in the viewport, without selection outlines.
bpy.ops.object.select_all(action='DESELECT')
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            a.spaces.active.region_3d.view_distance=.46
            a.spaces.active.region_3d.view_location=(0,0,.01)
            a.spaces.active.overlay.show_floor=False
            a.spaces.active.overlay.show_axis_x=False
            a.spaces.active.overlay.show_axis_y=False
            a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'motherboard.blend'))
print('REVIEW_COMPLETE',json.dumps({k:v for k,v in manifest.items() if k!='anchors'}))

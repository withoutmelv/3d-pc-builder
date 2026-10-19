"""Small batched geometry toolkit for the six reference-derived PC assets.
Construction coordinates are millimetres; exported meshes and pivots are metres.
Run from Blender via the local MCP bridge, not ordinary Python.
"""
import bpy, bmesh, math, json
from pathlib import Path
from collections import defaultdict
from mathutils import Vector

ROOT=Path('/Users/withoutmelv/work/3d-pc-builder')

class Part:
 def __init__(self,key,title):
  self.key,self.title=key,title
  self.out=ROOT/'assets'/key; (self.out/'previews').mkdir(parents=True,exist_ok=True)
  # Rebuilding replaces only this script's generated scene, never user scenes.
  for old in list(bpy.data.scenes):
   if old.name.startswith(key.upper()+'_Reference_Model'):
    for obj in list(old.objects):
     data=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
     if isinstance(data,bpy.types.Mesh) and data.users==0:bpy.data.meshes.remove(data)
    bpy.data.scenes.remove(old)
  self.scene=bpy.data.scenes.new(key.upper()+'_Reference_Model');bpy.context.window.scene=self.scene
  self.scene.unit_settings.system='METRIC'
  self.model=bpy.data.collections.new(key+'_Model');self.scene.collection.children.link(self.model)
  self.studio=bpy.data.collections.new(key+'_Studio');self.scene.collection.children.link(self.studio)
  self.groups={};self.buffers=defaultdict(lambda:[[],[]]);self.materials={};self.texts=[]
  self.group('ROOT',title=title,units='metres',accuracy='Reference-derived visualization; hidden geometry and fit are approximate')
  for name,c,m,r in [
   ('black',(.009,.012,.016),.05,.52),('rubber',(.004,.005,.006),0,.8),
   ('dark',(.045,.055,.065),.65,.36),('silver',(.48,.51,.54),.8,.3),
   ('white',(.77,.79,.81),.25,.32),('gold',(.62,.4,.095),.78,.32),
   ('pcb',(.009,.018,.017),.08,.62),('ink',(.002,.003,.004),0,.75),
   ('print',(.63,.68,.7),.05,.65),('blue',(.06,.38,.75),.3,.3),
   ('glass',(.6,.68,.72),0,.06),('film',(.18,.46,.56),0,.25)]: self.mat(name,c,m,r)
  p=next(n for n in self.materials['glass'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.45
  self.mat('rgb',(.28,.65,.82),.05,.28)
 def mat(self,name,c,metal=0,rough=.4):
  m=bpy.data.materials.new(self.key+'_'+name);m.use_nodes=True;m.diffuse_color=(*c,1)
  ns=m.node_tree.nodes;ns.clear();p=ns.new('ShaderNodeBsdfPrincipled');o=ns.new('ShaderNodeOutputMaterial')
  p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
  p.inputs['Specular IOR Level'].default_value=.3;m.node_tree.links.new(p.outputs['BSDF'],o.inputs['Surface'])
  self.materials[name]=m;return m
 def group(self,name,pos=(0,0,0),rot=(0,0,0),parent='ROOT',**props):
  o=bpy.data.objects.new(self.key+'_'+name,None);self.model.objects.link(o)
  if name!='ROOT':o.parent=self.groups[parent]
  o.location=Vector(pos)*.001;o.rotation_euler=rot
  for k,v in props.items():o[k]=v
  self.groups[name]=o;return name
 def emit(self,g,m,vs,fs):
  v,f=self.buffers[(g,m)];n=len(v);v.extend(vs);f.extend(tuple(i+n for i in face) for face in fs)
 def poly(self,g,m,p,z,h):
  n=len(p);self.emit(g,m,[(x,y,z-h/2) for x,y in p]+[(x,y,z+h/2) for x,y in p],
   [tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
 def box(self,g,m,x,y,z,w,d,h,c=0):
  a,b,l,t=x-w/2,x+w/2,y-d/2,y+d/2;c=min(c,w/3,d/3)
  self.poly(g,m,[(a+c,l),(b-c,l),(b,l+c),(b,t-c),(b-c,t),(a+c,t),(a,t-c),(a,l+c)] if c else [(a,l),(b,l),(b,t),(a,t)],z,h)
 def cyl(self,g,m,x,y,z,r,h,n=24):
  self.poly(g,m,[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n)) for i in range(n)],z,h)
 def ring(self,g,m,x,y,z,ro,ri,h,n=48):
  vs=[]
  for zz,r in [(z-h/2,ro),(z+h/2,ro),(z-h/2,ri),(z+h/2,ri)]:vs.extend((x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),zz) for i in range(n))
  fs=[]
  for i in range(n):
   j=(i+1)%n;fs.extend([(i,j,j+n,i+n),(i+2*n,i+3*n,j+3*n,j+2*n),(i+n,j+n,j+3*n,i+3*n),(i,i+2*n,j+2*n,j)])
  self.emit(g,m,vs,fs)
 def wire(self,g,m,points,r=.5,n=8):
  for a,b in zip(points,points[1:]):
   a,b=Vector(a),Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
   if u.length<.01:u=direction.cross(Vector((0,1,0)))
   u.normalize();v=direction.cross(u)
   vs=[tuple(p+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for p in (a,b) for i in range(n)]
   self.emit(g,m,vs,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
 def label(self,g,text,pos,size,mat='print',rot=(0,0,0)):
  self.texts.append((g,text,pos,size,mat,rot))
 def screw(self,g,x,y,z,r=2):
  self.cyl(g,'silver',x,y,z,r,1,16);self.box(g,'ink',x,y,z+.51,r*1.3,.4,.03);self.box(g,'ink',x,y,z+.52,.4,r*1.3,.03)
 def frame(self,g,mat,w,h,r,depth):
  # Square/rectangular outer edge joined to a true circular fan opening.
  n=96;v=[]
  for z,inner in [(-depth/2,False),(depth/2,False),(-depth/2,True),(depth/2,True)]:
   for i in range(n):
    a=math.tau*i/n;c,s=math.cos(a),math.sin(a);rr=r if inner else min(w/2/max(abs(c),1e-9),h/2/max(abs(s),1e-9))
    v.append((rr*c,rr*s,z))
  fs=[]
  for i in range(n):
   j=(i+1)%n;fs.extend([(i,j,j+n,i+n),(i+2*n,i+3*n,j+3*n,j+2*n),(i+n,j+n,j+3*n,i+3*n),(i,i+2*n,j+2*n,j)])
  self.emit(g,mat,v,fs)
 def fan(self,name,pos,size,depth=25,rot=(0,0,0),parent='ROOT',color='black',framed=True,blades=9,reverse=False):
  g=self.group(name,pos,rot,parent,kind='fan',diameter_mm=size,airflow_local='-Z')
  r=size*.46
  if framed:
   self.frame(g,color,size,size,r,depth)
   for x in [-size*.438,size*.438]:
    for y in [-size*.438,size*.438]:
     self.box(g,'rubber',x,y,depth/2+.1,size*.12,size*.12,1,2)
     self.ring(g,'silver',x,y,depth/2+.7,2.2,1.2,.3,16)
  rotor=self.group(name+'_Rotor',(0,0,0),parent=g,kind='rotor',rotation_axis='local Z',spin_sign=-1 if reverse else 1)
  self.cyl(rotor,color,0,0,0,size*.14,depth*.65,48)
  self.cyl(rotor,'silver' if color=='white' else 'dark',0,0,depth*.34,size*.125,.5,48)
  # Curved swept blades with pitch and thickness; not flat radial rectangles.
  sign=-1 if reverse else 1
  for blade in range(blades):
   verts=[];faces=[];steps=9
   for side in [-1,1]:
    for i in range(steps):
     t=i/(steps-1);rr=size*.12+(r-size*.13)*t
     for edge in [0,1]:
      a=blade*math.tau/blades+sign*(.48*t+edge*(.68-.22*t))
      verts.append((rr*math.cos(a),rr*math.sin(a),3+(edge-.5)*depth*.38+side*.55))
   nn=steps*2
   for i in range(steps-1):
    j=i*2;faces.extend([(j,j+2,j+3,j+1),(nn+j+1,nn+j+3,nn+j+2,nn+j),(j,nn+j,nn+j+2,j+2),(j+1,j+3,nn+j+3,nn+j+1)])
   faces.extend([(0,1,nn+1,nn),(nn-2,2*nn-2,2*nn-1,nn-1)])
   self.emit(rotor,color,verts,faces)
  for a in [0,math.pi/2,math.pi,math.pi*1.5]:
   self.wire(g,color,[(0,0,-depth*.35),(r*math.cos(a+.2),r*math.sin(a+.2),-depth*.35)],size*.018)
  return g
 def finish(self,views,notes):
  for (g,m),(vs,fs) in self.buffers.items():
   mesh=bpy.data.meshes.new(self.key+'_'+g+'_'+m);mesh.from_pydata([tuple(c*.001 for c in v) for v in vs],[],fs);mesh.materials.append(self.materials[m]);mesh.update()
   bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
   o=bpy.data.objects.new(mesh.name,mesh);self.model.objects.link(o);o.parent=self.groups[g]
   if g.endswith('_Rotor'):
    for face in mesh.polygons:face.use_smooth=True
  for g,body,pos,size,mat,rot in self.texts:
   data=bpy.data.curves.new(self.key+'_marking','FONT');data.body=body;data.size=size*.001;data.resolution_u=2;data.materials.append(self.materials[mat])
   o=bpy.data.objects.new(self.key+'_label_'+body,data);self.model.objects.link(o);o.parent=self.groups[g];o.location=Vector(pos)*.001;o.rotation_euler=rot
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
  bpy.context.view_layer.update()
  points=[o.matrix_world@Vector(v) for o in self.model.objects if o.type=='MESH' for v in o.bound_box]
  lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)));center=(lo+hi)/2;span=max(hi-lo)
  s=self.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1400;s.render.resolution_y=1100;s.render.resolution_percentage=100
  s.world=bpy.data.worlds.new(self.key+'_World');s.world.use_nodes=True
  bg=next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.13,.16,.2,1);bg.inputs[1].default_value=.5
  s.view_settings.view_transform='AgX';s.view_settings.exposure=-.4
  camdata=bpy.data.cameras.new(self.key+'_Camera');cam=bpy.data.objects.new(self.key+'_Camera',camdata);self.studio.objects.link(cam);s.camera=cam;camdata.type='ORTHO';camdata.clip_start=.0001;camdata.clip_end=100
  for i,(pos,power,size) in enumerate([((-.8,-1.2,1.6),70,1),((1,.1,1.3),90,.8),((-.4,1,.5),45,.7)]):
   d=bpy.data.lights.new(self.key+'_Softbox'+str(i),'AREA');d.energy=power*.18*(span/.3)**2;d.shape='DISK';d.size=size*span
   o=bpy.data.objects.new(d.name,d);self.studio.objects.link(o);o.location=center+Vector(pos)*span;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
  bpy.ops.object.select_all(action='DESELECT')
  for o in self.model.objects:o.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(self.out/(self.key+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
  def frame_camera(direction,scale):
   cam.location=center+Vector(direction)*span;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
   rotation=cam.rotation_euler.to_matrix().transposed();projected=[rotation@(v-center) for v in points]
   w=max(v.x for v in projected)-min(v.x for v in projected);h=max(v.y for v in projected)-min(v.y for v in projected)
   cam.data.ortho_scale=max(span*scale,w*1.12,h*1.12*s.render.resolution_x/s.render.resolution_y)
  for name,direction,scale in views:
   hidden=[]
   if name=='interior':
    hidden=[o for o in self.model.objects if o.type=='MESH' and any(k in o.name for k in ['Side_Glass','Front_Panel'])]
    for o in hidden:o.hide_render=True
   frame_camera(direction,scale)
   s.render.filepath=str(self.out/'previews'/f'{name}.png');bpy.ops.render.render(write_still=True)
   for o in hidden:o.hide_render=False
  name,direction,scale=views[0];frame_camera(direction,scale)
  bpy.ops.object.select_all(action='DESELECT')
  # Save only this scene and its dependencies, preserving previously open scenes.
  bpy.data.libraries.write(str(self.out/(self.key+'.blend')),{s},fake_user=True)
  meshes=[o for o in self.model.objects if o.type=='MESH'];tri=0
  for o in meshes:o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
  manifest={'model':self.title,'created':'2026-09-20','workflow':'Blender 5.2 + local blender-mcp execute_blender_code','upstream_commit':'6f992ffbca3cb715d111fc640b737b808632273c','units':'metres','blender_bounds_mm':[list(lo*1000),list(hi*1000)],'mesh_count':len(meshes),'triangles':tri,'glb_bytes':(self.out/(self.key+'.glb')).stat().st_size,'groups':list(self.groups),'notes':notes,'website_integrated':False}
  (self.out/'model-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
  print('PART_COMPLETE',self.key,tri,flush=True)

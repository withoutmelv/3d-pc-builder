"""Approved component studies. Call build('gpu'), etc., through Blender MCP.
Do not import third-party mesh archives. All geometry is constructed here.
"""
import math
from part_geometry import Part
P=math.pi

def ram():
 p=Part('ram','CORSAIR VENGEANCE RGB DDR5');b=p.box
 p.mat('pattern',(.068,.077,.085),.25,.55)
 p.group('Body');p.group('ANCHOR_dimm_seat',(0,-24,0),kind='ddr5',key_offset_mm=3.5)
 # Key slot and latch notches are part of the PCB silhouette, not painted marks.
 outline=[(-66.5,-24),(2.8,-24),(2.8,-20.5),(4.2,-20.5),(4.2,-24),(66.5,-24),(66.5,-17),(65,-17),(65,-14),(66.5,-14),(66.5,20),(-66.5,20),(-66.5,-14),(-65,-14),(-65,-17),(-66.5,-17)]
 p.poly('Body','pcb',outline,0,1.4)
 for z in [-.76,.76]:
  for i in range(144):
   x=-64.8+i*.905
   if 2.3<x<4.8:continue
   b('Body','gold',x,-21.65,z,.56,4.2,.08)
 for side in [-1,1]:
  z=side*2.6
  p.poly('Body','dark',[(-65,-17),(65,-17),(65,16),(59,22),(-59,22),(-65,16)],z,2.4)
  p.poly('Body','black',[(-63,11),(-25,11),(-20,-7),(20,-7),(25,11),(63,11),(63,20),(-63,20)],side*4,1)
  p.poly('Body','dark',[(-26,11),(26,11),(21,-6),(-21,-6)],side*4.58,.15)
  for row in range(5):
   for col in range(38):
    x=-61+col*3.3;y=-14+row*3.4
    if abs(x)<26 and y>-8:continue
    p.poly('Body','pattern',[(x,y),(x+2.4,y),(x+1.2,y+2)],side*3.82,.03)
  for i in range(10):b('Body','black',-55+i*12,23,side*1.8,6,1,2)
 p.label('Body','VENGEANCE',(-20,1,4.67),4,'print')
 p.label('Body','DDR5',(-6,-14,3.86),3,'dark')
 for i,c in enumerate([(.8,.62,.16),(.65,.72,.2),(.25,.75,.4),(.16,.65,.7),(.18,.4,.8),(.45,.24,.75),(.75,.2,.5)]):
  name='diffuser_'+str(i);p.mat(name,c,.05,.35);b('Body',name,-56.57+i*18.857,25,0,18.86,5,7,.5 if i in [0,6] else 0)
 p.label('Body','CORSAIR',(-10,24,3.55),2.1,'ink')
 b('Body','ink',0,0,-4.6,45,13,.1)
 p.label('Body','DDR5  |  6000 MT/s',(-19,3,-4.68),2,'print',(P,0,0))
 for i in range(36):b('Body','print',-18+i,0,-4.7,.35,4,.04)
 # Calibrate the visual outline to the manufacturer's DDR5 Vengeance RGB envelope.
 # Bake millimetre coordinate changes into vertices, labels and the insertion datum.
 sx,sy,sz=135/133,44/51.5,8/9.39
 for vs,fs in p.buffers.values():vs[:]=[(x*sx,y*sy,z*sz) for x,y,z in vs]
 p.texts=[(g,t,(v[0]*sx,v[1]*sy,v[2]*sz),size,mat,rot) for g,t,v,size,mat,rot in p.texts]
 p.groups['ANCHOR_dimm_seat'].location.y*=sy
 p.finish([('hero',(0,-.9,1.8),1.2),('front',(0,0,2),1.12),('back',(0,0,-2),1.12)],['Single 135 × 44 × 8 mm visual module, per CORSAIR DDR5 dimension guide; duplicate for a two-DIMM kit.','DDR5 key and latch notches are modeled; exact connector pin placement and heatsink depth are approximate.','RGB diffuser is a separate material; no animation or lighting controller included.'])

def ssd():
 p=Part('ssd','Samsung 990 EVO 1TB M.2 2280');b=p.box;p.group('Body')
 # M-key at connector end and open semicircular mounting notch at opposite end.
 pts=[(-40,-11),(40,-11),(40,-7.5),(36.5,-7.5),(36.5,-6),(40,-6),(40,11),(-40,11),(-40,3)]
 pts += [(-40+3*math.cos(a),3*math.sin(a)) for a in [P/2-i*P/16 for i in range(17)]]
 pts += [(-40,-11)]
 p.poly('Body','pcb',pts,0,.8)
 for z in [-.44,.44]:
  for i in range(30):
   y=-10+i*.68
   if -8<y<-5.6:continue
   b('Body','gold',38.4,y,z,3.2,.42,.08)
  p.ring('Body','gold',-39.8,0,z,3.9,3.1,.06,48)
 # Trim gold to board boundary later by using a half-ring geometry instead.
 for x,w in [(-27,18),(-7,17),(11,13),(27,8)]:b('Body','black',x,0,1.05,w,17,1.3,.5)
 for x in range(-35,35,3):
  for y in [-9.5,9.5]:
   b('Body','dark',x,y,.7,1.5,.75,.6);b('Body','silver',x-.6,y,1.03,.25,.75,.04)
 b('Body','ink',6,0,1.78,52,16,.14,.4)
 p.label('Body','SAMSUNG',(-17,4.6,1.86),2.2)
 p.label('Body','V-NAND SSD',(-17,2,1.86),1.3)
 p.label('Body','990 EVO',(-17,-1.6,1.86),3.6)
 p.label('Body','1TB',(23,-5.7,1.86),2.5)
 p.label('Body','PCIe 4.0 x4 / 5.0 x2',(-17,-5.7,1.86),1.1)
 b('Body','ink',0,0,-.48,67,18,.1)
 p.label('Body','SAMSUNG SSD',(-30,4,-.55),3,'print',(P,0,0))
 p.label('Body','990 EVO 1TB   M.2 2280',(-30,-2,-.55),1.8,'print',(P,0,0))
 p.group('ANCHOR_m_key',(40,0,0),kind='m2_m_key');p.group('ANCHOR_mount',(-40,0,0),kind='m2_fixing')
 # Remove outboard half of the annulus from the geometry buffer.
 vs,fs=p.buffers[('Body','gold')];fs[:]=[f for f in fs if all(vs[i][0]>=-40.01 for i in f)]
 p.finish([('hero',(-.25,-1.1,2),1.23),('front',(0,0,2),1.15),('back',(0,0,-2),1.15)],['80 × 22 mm PCB; package thickness approximated from photographs.','M-key and half-round tail are physical geometry. Label is distinct from removable motherboard thermal-pad film.','Brand text is reconstructed geometry; regulatory symbols and serial numbers are intentionally omitted.'])

def gpu():
 p=Part('gpu','GIGABYTE RTX 4090 AERO OC 24G');b=p.box
 for g in ['Heatsink','PCB','Shroud','Backplate','IO_Bracket','Power_16pin']:p.group(g)
 # Overall envelope 342 × 150 × 75. Fan faces are Blender +Z.
 for x in range(-164,168,3):b('Heatsink','silver',x,1,-6,1,126,47,.2)
 for j in range(10):p.wire('Heatsink','silver',[(-145,-50+j*10,-29),(-125,-50+j*10,-20),(144,-50+j*10,-20)],2.1,10)
 b('PCB','pcb',-35,0,-31,260,138,1.6,3)
 # Three continuous shroud cells with genuinely open round fan wells.
 for i,x in enumerate([-112,0,112]):
  g=p.group('Shroud_Cell_'+str(i+1),(x,0,28),parent='Shroud');p.frame(g,'white',112,144,54.8,16)
  fan=p.fan('Fan_'+str(i+1),(x,0,29),110,13,color='white',framed=False,blades=11,reverse=i==1)
  p.label('Fan_'+str(i+1)+'_Rotor','AERO',(-9,-1,4.8),5,'dark')
  for y in [-66,66]:b(g,'silver',0,y,8.1,95,2,.2)
 for y in [-73,73]:
  for z in [-29,29]:b('Shroud','white',0,y,z,337,4,11,1)
  for x in [-166,166]:b('Shroud','white',x,y,0,5,4,50,1)
 p.label('Shroud','GEFORCE RTX',(-49,-75.05,25),7,'dark',(P/2,0,0))
 # Backplate: large far-end screen-cooling opening and ribs.
 b('Backplate','silver',-46,0,-36.5,244,146,2,4)
 for y in [-67,67]:b('Backplate','silver',123,y,-36.5,91,12,2,2)
 for x in [83,165]:b('Backplate','silver',x,0,-36.5,7,127,2)
 for x in range(91,160,14):b('Backplate','dark',x,0,-36.5,2,122,2)
 p.label('Backplate','AERO',(-113,13,-37.55),25,'dark',(P,0,0))
 p.label('Backplate','GIGABYTE',(-110,-16,-37.55),8,'dark',(P,0,0))
 for x in [-157,-64,44,155]:
  for y in [-62,62]:p.screw('Backplate',x,y,-37.7,2)
 # PCIe edge connector extends below PCB; keyed gap is real.
 b('PCB','pcb',-80.5,-73.5,-31,17,9,1.6)
 b('PCB','pcb',-33.5,-73.5,-31,69,9,1.6)
 for side in [-1,1]:
  for i in range(68):
   x=-87+i*1.25
   if -72<x<-68:continue
   b('PCB','gold',x,-74,-31+side*.85,.8,7,.08)
 p.group('ANCHOR_pcie',(-44,-77,-31),kind='pcie_x16')
 # I/O bracket is a perimeter + vent bars with four recessed connector shells.
 for z in [-34,28]:b('IO_Bracket','silver',-170,0,z,2,147,4)
 for y in [-72,72]:b('IO_Bracket','silver',-170,y,-3,2,4,60)
 for y in range(-65,70,9):b('IO_Bracket','silver',-170,y,16,2,2,18)
 for i,y in enumerate([-50,-19,12,43]):
  g=p.group(('HDMI' if i==0 else 'DisplayPort_'+str(i)),(-171,y,-13),(0,-P/2,0),parent='IO_Bracket',kind='display_output')
  b(g,'silver',0,0,0,15,21,4,1);b(g,'ink',0,0,2.1,10,17,.2,1);b(g,'gold',0,0,2.25,1,13,.15)
 for y in [-62,62]:b('IO_Bracket','silver',-166,y,-36,12,8,2)
 # Recessed top-edge 12+4 socket. Small sense contacts separated from power pins.
 g=p.group('Socket16',(-5,71,-20),(P/2,0,0),parent='Power_16pin')
 b(g,'black',0,0,0,24,12,10,1)
 for row in range(2):
  for col in range(6):
   b(g,'ink',(col-2.5)*3.2,(row-.5)*3.3,5.05,2.5,2.5,.1);b(g,'gold',(col-2.5)*3.2,(row-.5)*3.3,5.1,.6,.6,.1)
 for i in range(4):b(g,'silver',(i-1.5)*2,-4.5,5.1,.6,.5,.1)
 p.group('ANCHOR_gpu_power',(-5,77,-20),kind='12VHPWR_16pin')
 p.group('ANCHOR_io_fixing',(-168,-62,-36),kind='case_bracket')
 p.finish([('hero',(.65,-1,1.8),1.25),('fans',(0,0,2),1.14),('back',(0,0,-2),1.14)],['Official envelope: 342 × 150 × 75 mm, excluding connector tabs.','Three 110 mm fans, each with separate rotor; center rotates opposite to outer fans.','10 visual heatpipes, backplate screen opening, three DisplayPort + one HDMI, 16-pin power.','Website wind/card.png is only an animation layer; never use it alone as the complete exterior. Hidden fin routing, vent pattern, blade profiles and socket internals are approximate.'])

def cooler():
 p=Part('cooler','Thermalright Phantom Spirit 120 SE');b=p.box
 for g in ['Heatsink','Coldplate','Crossbar']:p.group(g)
 b('Coldplate','silver',0,0,3,40,40,6,3)
 p.group('Protective_Film',kind='remove_before_mount');b('Protective_Film','film',0,0,-.15,39,39,.15,2);b('Protective_Film','film',23,0,-.15,10,8,.15,2)
 for j in range(7):
  x=(j-3)*14
  p.wire('Heatsink','silver',[(x,-34,150),(x,-34,30),(x*.42,-18,10),(x*.42,18,10),(x,34,30),(x,34,150)],3,12)
 for cy in [-35,35]:
  for i in range(49):
   z=40+i*2.28
   outline=[(-62.5,cy-19),(-50,cy-20),(-35,cy-18),(35,cy-18),(50,cy-20),(62.5,cy-19),(62.5,cy+19),(50,cy+20),(35,cy+18),(-35,cy+18),(-50,cy+20),(-62.5,cy+19)]
   p.poly('Heatsink','silver',outline,z,.48)
  b('Heatsink','black',0,cy,152,125,39,1,3)
  for j in range(7):p.cyl('Heatsink','dark',(j-3)*14,cy,153,3.1,2,16)
  p.label('Heatsink','THERMALRIGHT',(-32,cy-3,152.6),6,'print')
 # Both fans face the same horizontal airflow: front of first tower and inter-tower gap.
 for i,y in enumerate([-68,0]):
  g=p.fan('Fan_'+str(i+1),(0,y,91),120,25,(P/2,0,0),blades=9)
  p.label(g+'_Rotor','THERMALRIGHT',(-13,-1,9),2.5)
  for side in [-1,1]:
   clip=p.group(f'Wire_Clip_{i+1}_{"L" if side<0 else "R"}',kind='spring_wire_clip',fan=g)
   x=side*60.5
   # Hook into fan corners, long wire legs, proud pull-loop, heatsink engagement kink.
   pts=[(side*53,y-10,143),(x,y-10,143),(x,y+16,133),(side*64,y+19,111),(side*69,y+22,104),(side*69,y+22,78),(side*64,y+19,71),(x,y+16,49),(x,y-10,39),(side*53,y-10,39)]
   p.wire(clip,'silver',pts,.65,10)
  cable=p.group('PWM_Cable_'+str(i+1),kind='fan_pwm_lead')
  p.wire(cable,'black',[(54,y,39),(65,y-5,24),(67,y+18,12),(75,y+28,12)],1,8)
  b(cable,'black',76,y+28,12,9,6,4)
  for j in range(4):b(cable,'silver',73+j*2,y+31.1,12,.6,.2,1)
 b('Crossbar','dark',0,0,12,92,12,5,2)
 for side in [-1,1]:
  g=p.group('AM5_Rail_'+str(side),(side*45,0,8),kind='mounting_bracket')
  b(g,'silver',0,0,0,12,64,3,3)
  for yy in [-27,27]:
   p.ring(g,'silver',0,yy,0,5,2,3,24)
   sp=p.group('Spacer_'+str(side)+'_'+str(yy),(side*45,yy,3),kind='mounting_spacer');p.ring(sp,'black',0,0,0,4,2,6,24)
  sg=p.group('Spring_Screw_'+str(side),(side*43,0,18),kind='spring_screw')
  p.cyl(sg,'silver',0,0,-3,1.5,16,16);p.screw(sg,0,0,5,3)
  spring=[(3*math.cos(i*.22),3*math.sin(i*.22),-4+i*.085) for i in range(100)]
  p.wire(sg,'silver',spring,.45,6)
 p.group('ANCHOR_thermal_contact',(0,0,0),kind='cpu_heatspreader');p.group('ANCHOR_airflow',(0,-81,91),direction='+Y')
 p.finish([('hero',(1.1,-1.5,1),1.55),('front',(0,-2,.15),1.5),('side',(2,0,.1),1.5)],['Heatsink 125 W × 110 D × 154 H mm; two 120 × 120 × 25 fans extend depth.','Seven 6 mm heatpipes. Fans mounted vertically at front and between towers, both blowing toward +Y.','Four individual bent wire clips, AM5 rails/spacers, spring screws, removable coldplate film and PWM leads.','Bracket hole locations and clip bends reconstructed from photos; not a manufacturing fit drawing.'])

def psu():
 p=Part('psu','CORSAIR RM1000x 2024');b=p.box
 for g in ['Housing','Fan_Grille','AC_Panel','Modular_Panel']:p.group(g)
 b('Housing','black',0,0,-42,150,160,2,2)
 for x in [-74,74]:b('Housing','dark',x,0,0,2,160,84)
 b('Modular_Panel','black',0,-79,0,146,2,84)
 # Ventilated fan roof: actual voids, fan behind the mesh, rigid outer rim.
 p.fan('Fan_140',(0,0,28),140,20,framed=False,blades=9)
 for x in [-73,73]:b('Fan_Grille','dark',x,0,42,4,160,2)
 for y in [-77,77]:b('Fan_Grille','dark',0,y,42,146,6,2)
 for y in range(-71,73,5):
  pts=[(x,y+1.5*math.sin(x*.48+(y%2)*P),42) for x in range(-69,70,2)]
  p.wire('Fan_Grille','dark',pts,.7,5)
 for x in range(-67,70,12):p.wire('Fan_Grille','dark',[(x,-72,42),(x,72,42)],.5,5)
 for x in [-64,64]:
  for y in [-64,64]:p.screw('Fan_Grille',x,y,43,2)
 # Rear AC panel with open exhaust field and controls to one side.
 for x in [-73,73]:b('AC_Panel','dark',x,79,0,4,2,86)
 for z in [-41,41]:b('AC_Panel','dark',0,79,z,146,2,4)
 b('AC_Panel','dark',49,79,0,43,2,78)
 for x in range(-68,28,6):b('AC_Panel','black',x,79,0,1.3,2,78)
 for z in range(-36,39,6):b('AC_Panel','black',-21,79,z,97,2,1.3)
 g=p.group('AC_Inlet',(49,81,-2),(-P/2,0,0),kind='iec_c14')
 b(g,'black',0,0,0,29,22,3,3);b(g,'ink',0,0,1.6,23,17,.2,2)
 for x,y in [(-6,-4),(6,-4),(0,4)]:b(g,'silver',x,y,2.3,2,4,1)
 g=p.group('Power_Switch',(49,81,25),(-P/2,0,0),kind='rocker_switch')
 b(g,'black',0,0,0,19,13,4,1);p.label(g,'I   O',(-6,-1,2.1),3)
 g=p.group('Fan_Override',(49,82,-27),(-P/2,0,0),kind='fan_control')
 p.cyl(g,'black',0,0,0,8,5,32);b(g,'print',0,4,2.6,.7,4,.1)
 # Simplified Type-4 modular socket arrangement, all on the cable face.
 def socket(name,x,z,cols,rows,pitch=4.2):
  g=p.group(name,(x,-81,z),(P/2,0,0),kind='modular_socket',pin_count=cols*rows)
  w=cols*pitch+3;h=rows*pitch+3
  b(g,'black',0,0,0,w,h,5,1)
  for row in range(rows):
   for col in range(cols):
    xx=(col-(cols-1)/2)*pitch;yy=(row-(rows-1)/2)*pitch
    # Alternate clipped corners make the keyed profile visible.
    c=.65 if (col+row)%2 else 0
    b(g,'ink',xx,yy,2.6,pitch-1,pitch-1,.15,c)
    b(g,'gold',xx,yy,2.7,.55,.55,.12)
  b(g,'black',0,h/2+.7,1,6,1.4,3)
  p.group('ANCHOR_'+name,(x,-86,z),kind='psu_socket',connector_family='CORSAIR_Type4_visual')
 socket('MB_18pin',-42,24,9,2);socket('MB_10pin',-49,3,5,2)
 for i,x in enumerate([-8,18,44]):socket('CPU_PCIE_'+str(i+1),x,24,4,2)
 for i,x in enumerate([-5,23,51]):socket('SATA_'+str(i+1),x,-22,3,2)
 socket('12V2x6',25,2,6,2,3.2)
 p.label('Modular_Panel','MOTHERBOARD',(-67,-80.1,35),3,'print',(P/2,0,0))
 p.label('Modular_Panel','CPU / PCIe',(-10,-80.1,35),3,'print',(P/2,0,0))
 for side in [-1,1]:
  # Side markings stand off by a fraction of a millimetre.
  g=p.group('Side_Label_'+str(side),(side*75.05,0,0),(P/2,0,side*P/2))
  b(g,'ink',0,0,0,144,40,.12,2);p.label(g,'RM1000x',(-53,0,.1),12)
  p.label(g,'CORSAIR',(-53,-12,.1),4.5)
 p.group('ANCHOR_psu_mount',(0,80,0),kind='atx_psu')
 p.finish([('hero',(1.2,1.4,1.1),1.55),('connectors',(0,-2,.2),1.2),('rear',(0,2,.2),1.2)],['Official housing 160 × 150 × 86 mm; 140 mm fan; 2024 conventional rear modular version, not SHIFT.','AC inlet, rocker switch and manual fan knob are separate groups.','Vent pattern and socket internal key positions are visual approximations, not an electrical wiring diagram.','Loose power cables are not included in this asset; assembly connector anchors are provided.'])

def case():
 p=Part('case','LIAN LI LANCOOL 216 Black non-RGB');b=p.box
 for g in ['Frame','Tray','PSU_Shroud','Front_Panel','Top_Panel','Side_Glass','Side_Right','Rear_Panel']:p.group(g,kind='removable_panel' if 'Panel' in g or 'Side_' in g else 'structure')
 # Overall width235 depth480.9 height491.7. Main volume raised on feet.
 for x in [-104,104]:
  for y in [-208,208]:b('Frame','rubber',x,y,9,24,45,18,4)
 for x in [-113,113]:
  for y in [-226,226]:b('Frame','dark',x,y,254,9,12,463,2)
 for z in [24,485]:
  for x in [-111,111]:b('Frame','dark',x,0,z,12,460,10)
  for y in [-224,224]:b('Frame','dark',0,y,z,220,12,10)
 b('Frame','black',0,0,23,220,450,2)
 # PSU chamber with large rear opening and cable apertures in the roof.
 b('PSU_Shroud','black',-110,0,74,2,435,98)
 b('PSU_Shroud','black',0,-78,125,220,280,2)
 b('PSU_Shroud','black',0,194,125,220,40,2)
 for x in [-95,0,95]:b('PSU_Shroud','black',x,140,125,28,68,2)
 # Motherboard tray is built around real rectangular cut-outs.
 for z,h in [(199.5,141),(422,104)]:b('Tray','black',88,-87,z,2,250,h)
 for y,w in [(-201,22),(-157,14),(-43,162)]:b('Tray','black',88,y,320,2,w,100)
 b('Tray','black',88,195,300,2,53,348)
 b('Tray','black',88,84,182,2,170,106)
 b('Tray','black',88,84,449,2,170,49)
 # CPU backplate access window remains empty between z235..424,y-1..169.
 for y in [-177,-137]:
  g=p.group('Cable_Grommet_'+str(y),(85,y,320),(0,P/2,0),kind='cable_passage')
  # Rectangular rubber surround; opening through the tray added below.
  for x in [-50,50]:b(g,'rubber',x,0,0,6,28,3,2)
  for yy in [-13,13]:b(g,'rubber',0,yy,0,100,4,3)
 # Mounting columns point from tray toward the open glass side.
 for row,z in enumerate([168,326,450]):
  for col,y in enumerate([-76,76,204]):
   g=p.group(f'Standoff_{row}_{col}',(81,y,z),(0,-P/2,0),kind='atx_standoff')
   p.ring(g,'gold',0,0,0,3,1.2,6,6)
 p.group('ANCHOR_atx_tray',(78,77,309),kind='motherboard_mount',alignment='Fit to actual motherboard mounting map before integration')
 p.group('ANCHOR_psu_bay',(0,123,70),kind='atx_psu')
 # Front removable frame and fine wire mesh, with both 160 mm fans visible behind.
 for x in [-114,114]:b('Front_Panel','dark',x,-236,253,7,9,464,1)
 for z in [26,481]:b('Front_Panel','dark',0,-236,z,224,9,9)
 for x in range(-106,108,4):b('Front_Panel','black',x,-240,254,.55,.7,440)
 for z in range(34,476,4):b('Front_Panel','black',0,-240,z,212,.7,.55)
 for i,z in enumerate([195,365]):p.fan('Front_Fan_'+str(i+1),(0,-213,z),160,28,(P/2,0,0),color='black',blades=9)
 p.label('Front_Panel','LIAN LI',(-19,-241,35),7,'silver',(P/2,0,0))
 # Roof mesh; removable top rail allows access from above.
 for y in [-224,224]:b('Top_Panel','dark',0,y,490,225,8,3)
 for x in [-111,111]:b('Top_Panel','dark',x,0,490,8,440,3)
 for x in range(-103,105,5):b('Top_Panel','black',x,0,490,.65,430,1)
 for y in range(-210,215,5):b('Top_Panel','black',0,y,490,212,.65,1)
 # Glass side with narrow metal perimeter and independent lower mesh strip.
 b('Side_Glass','glass',-115,0,305,3,444,348)
 for y in [-224,224]:b('Side_Glass','black',-117,y,305,1,7,353)
 for z in [132,478]:b('Side_Glass','black',-117,0,z,1,448,7)
 b('Side_Right','black',116,0,254,3,448,460)
 for z in range(35,122,4):b('Frame','dark',-115,0,z,2,444,1)
 # Rear panel surrounding fan / I/O / expansion / PSU openings.
 for x in [-111,111]:b('Rear_Panel','dark',x,229,254,8,2,455)
 for z in [30,128,305,478]:b('Rear_Panel','dark',0,229,z,215,2,8)
 p.fan('Rear_Fan',(-28,213,388),140,25,(-P/2,0,0),blades=9)
 for x in range(-96,42,7):b('Rear_Panel','dark',x,230,390,.7,1,136)
 for z in range(324,459,7):b('Rear_Panel','dark',-28,230,z,138,1,.7)
 # Seven independently removable expansion slot covers, aligned below rear fan.
 for i in range(7):
  z=155+i*20.3;g=p.group('Slot_Cover_'+str(i+1),kind='removable_pcie_cover',slot_index=i)
  for zz in [-7,7]:b(g,'dark',-12,230,z+zz,126,2,2)
  for x in range(-73,50,7):b(g,'dark',x,230,z,1.2,2,12)
  b(g,'dark',-82,229,z,10,8,17)
  a=p.group('ANCHOR_slot_'+str(i+1),(-82,229,z),kind='slot_fixing')
 # Dedicated rear I/O opening beside fan, not a filled rectangle.
 for x in [49,100]:b('Rear_Panel','dark',x,229,390,3,2,154)
 for z in [314,466]:b('Rear_Panel','dark',74.5,229,z,51,2,3)
 # Front I/O visible on top-left rail: button, 2 USB-A, USB-C, audio.
 g=p.group('Front_IO',(-101,-165,483),kind='front_io')
 p.cyl(g,'dark',0,-30,3,5,2,24);p.group('Power_Button',(-101,-195,487),kind='power_button')
 for y in [-10,10]:
  b(g,'silver',0,y,3,9,15,2,1);b(g,'ink',0,y,4.05,6,12,.1);b(g,'blue',0,y,4.1,2,10,.1)
 b(g,'silver',0,29,3,5,10,2,2);b(g,'ink',0,29,4.05,3,8,.1,1)
 p.ring(g,'silver',0,45,3,3,2,1,24)
 # Two cable-side SSD trays and lower drive cage with detachable sleds.
 for i,y in enumerate([8,118]):
  g=p.group('SSD_Tray_'+str(i+1),(96,y,280),kind='removable_drive_tray')
  b(g,'dark',0,0,0,2,76,110)
  for yy in [-30,30]:
   for z in [-46,46]:b(g,'silver',-2,yy,z,2,4,4)
 g=p.group('Drive_Cage',(0,-125,73),kind='drive_cage')
 for x in [-56,56]:b(g,'dark',x,0,0,2,150,85)
 for i,z in enumerate([49,90]):
  g=p.group('Drive_Sled_'+str(i+1),(0,-125,z),kind='removable_hdd_sled');b(g,'black',0,0,0,110,145,2)
  for x in [-54,54]:b(g,'black',x,0,6,3,145,12)
 # Visible cable bundle from front I/O, ending in separately named connectors.
 for i,(name,y) in enumerate([('POWER_SW',-178),('USB3',-164),('USB_C',-150),('HD_AUDIO',-136)]):
  g=p.group('Lead_'+name,kind='front_panel_lead')
  p.wire(g,'black',[(100,-181,467),(101,-185,420),(101,y,340),(104,y,290)],1.2 if i==0 else 2.2)
  b(g,'black',104,y,284,7,13 if i else 6,10)
  p.group('ANCHOR_'+name,(104,y,280),kind=name)
 p.finish([('hero',(-1.2,-1.6,.75),1.8),('interior',(-1.6,-1,.6),1.8),('rear',(-.8,1.6,.5),1.65)],['Official overall dimensions 235 W × 480.9 D × 491.7 H mm. Black non-RGB LANCOOL 216X.','Two 160 mm front fans and one 140 mm rear fan. Side, front and top panels and 7 PCIe covers are separate groups.','ATX tray, standoffs, rear I/O/PSU openings, drive sleds and front-I/O cable anchors are represented.','Interior panel folds, exact hole map, grille pattern and connector geometry are approximate. Mount alignment must be calibrated against the project motherboard before integration.','Interior preview temporarily hides glass and front mesh; GLB and blend include them.'])

BUILDERS={'ram':ram,'ssd':ssd,'gpu':gpu,'cooler':cooler,'psu':psu,'case':case}
def build(key):BUILDERS[key]()

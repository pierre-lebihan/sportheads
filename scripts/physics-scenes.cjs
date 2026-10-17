// Both engines receive exactly the same fixture descriptions and motor inputs.
const circle=(x,y,radius,density=1.5,extra={})=>({type:'circle',x,y,radius,density,friction:1,restitution:.6,fixed:false,angle:0,vx:0,vy:0,omega:0,...extra});
const box=(x,y,hx,hy,density=0,extra={})=>({type:'box',x,y,hx,hy,density,friction:.5,restitution:0,fixed:false,angle:0,vx:0,vy:0,omega:0,...extra});
const head=(x,y)=>circle(x,y,20,100,{fixed:true,friction:0,restitution:.01});
const foot=(x,y)=>box(x+4,y+15.6,20,5,2,{angle:1.37+Math.PI,restitution:1});
const motor=(a,b,x,y,torque=1e8)=>({a,b,x,y,torque});
const wave=tick=>tick<30?-6:tick<60?12:-4;
module.exports=[
  {name:'ball-floor',gravity:[0,300],ticks:180,bodies:[box(400,470,400,10),circle(400,300,10,1.5,{vx:75,vy:-100})],joints:[]},
  {name:'ball-tilted-wall',gravity:[0,0],ticks:90,bodies:[box(500,240,10,100,0,{angle:.15}),circle(400,240,10,1.5,{vx:150,vy:20,omega:8})],joints:[]},
  {name:'ball-box-corner',gravity:[0,0],ticks:90,bodies:[box(500,300,40,10,0,{angle:.3}),circle(420,260,10,1.5,{vx:200,vy:100})],joints:[]},
  {name:'ball-head',gravity:[0,0],ticks:90,bodies:[head(500,300),circle(400,290,10,1.5,{vx:200,vy:10,omega:3})],joints:[]},
  {name:'overlapping-circles',gravity:[0,0],ticks:30,bodies:[circle(400,300,10,1.5),circle(400,315,10,3)],joints:[]},
  {name:'motor-foot',gravity:[0,300],ticks:90,bodies:[head(600,200),foot(600,200)],joints:[motor(0,1,600,200)],motor:wave},
  {name:'motor-torque-limit',gravity:[0,0],ticks:90,bodies:[circle(400,240,20,0,{fixed:true}),foot(400,240)],joints:[motor(0,1,400,240,20000)],motor:wave},
  {name:'motor-foot-ball',gravity:[0,300],ticks:90,bodies:[head(400,200),foot(400,200),circle(455,225,10,1.5,{vx:-150,vy:0})],joints:[motor(0,1,400,200)],motor:wave},
  {name:'box-floor-two-points',gravity:[0,300],ticks:180,bodies:[box(400,470,400,10),box(400,300,20,5,2,{vx:30,vy:20})],joints:[]},
  {name:'box-rotated-floor',gravity:[0,300],ticks:150,bodies:[box(400,470,400,10),box(400,400,20,5,2,{angle:.35,vx:30,vy:20,omega:1})],joints:[]},
  {name:'motor-foot-ground',gravity:[0,300],ticks:90,bodies:[box(400,470,400,10),head(600,440),foot(600,440)],joints:[motor(1,2,600,440)],motor:wave},
  {name:'continuous-ball-floor',gravity:[0,300],ticks:180,continuous:true,bodies:[box(400,470,400,10),circle(400,300,10,1.5,{vx:75,vy:-100})],joints:[]},
  {name:'fast-ball-thin-wall',gravity:[0,0],ticks:8,continuous:true,bodies:[box(500,240,1,100),circle(430,240,10,1.5,{vx:5000})],joints:[]},
  {name:'fast-ball-corner',gravity:[0,0],ticks:8,continuous:true,bodies:[box(500,300,40,5,0,{angle:.3}),circle(430,250,10,1.5,{vx:4000,vy:2500})],joints:[]},
  {name:'fast-box-wall',gravity:[0,0],ticks:8,continuous:true,bodies:[box(500,240,1,100),box(430,240,20,5,2,{vx:4000,angle:.2,omega:4,restitution:.4})],joints:[]},
  {name:'bullet-ball-head',gravity:[0,0],ticks:8,continuous:true,bodies:[head(500,300),circle(400,300,10,1.5,{vx:6000,bullet:true})],joints:[]},
  {name:'sleep-and-wake',gravity:[0,300],ticks:150,sleep:true,kickAt:{tick:100,body:1,vx:0,vy:-100,omega:0},bodies:[box(400,470,400,10),circle(400,450,10,1.5,{restitution:0,friction:.5})],joints:[]},
  {name:'connected-sleep',gravity:[0,0],ticks:75,sleep:true,bodies:[head(400,300),box(420,300,10,5,2)],joints:[motor(0,1,400,300)]},
  {name:'island-three-circles',gravity:[0,0],ticks:45,bodies:[circle(360,300,10,1.5,{vx:150}),circle(400,300,10,1.5),circle(440,300,10,1.5,{vx:-150})],joints:[]},
  {name:'convex-ramp',gravity:[0,300],ticks:90,bodies:[{type:'polygon',x:400,y:450,angle:0,density:0,friction:.5,restitution:0,fixed:false,vx:0,vy:0,omega:0,vertices:[[-150,0],[150,-100],[150,30],[-150,30]]},circle(400,330,10,1.5,{vx:30})],joints:[]},
  {name:'continuous-motor-ground',gravity:[0,300],ticks:90,continuous:true,bodies:[box(400,470,400,10),head(600,440),foot(600,440)],joints:[motor(1,2,600,440)],motor:wave},
  {name:'convex-triangle',gravity:[0,300],ticks:100,bodies:[box(400,470,400,10),{type:'polygon',x:400,y:350,angle:.1,density:1,friction:0,restitution:1,fixed:false,vx:20,vy:0,omega:.1,vertices:[[0, -30], [25.95, 15], [-25.95, 15]]}],joints:[]},
  {name:'convex-right-triangle',gravity:[0,300],ticks:100,bodies:[box(400,470,400,10),{type:'polygon',x:400,y:350,angle:.1,density:1,friction:0,restitution:1,fixed:false,vx:20,vy:0,omega:.1,vertices:[[0, 0], [0, -30], [30, 0]]}],joints:[]},
  {name:'convex-trapezoid',gravity:[0,300],ticks:100,bodies:[box(400,470,400,10),{type:'polygon',x:400,y:350,angle:.1,density:1,friction:0,restitution:1,fixed:false,vx:20,vy:0,omega:.1,vertices:[[-15, -15], [15, -15], [30, 15], [-30, 15]]}],joints:[]},
  {name:'convex-hexagon',gravity:[0,300],ticks:100,bodies:[box(400,470,400,10),{type:'polygon',x:400,y:350,angle:.1,density:1,friction:0,restitution:1,fixed:false,vx:20,vy:0,omega:.1,vertices:[[15, -25.98], [30, 0], [15, 25.98], [-15, 25.98], [-30, 0], [-15, -25.98]]}],joints:[]},
];

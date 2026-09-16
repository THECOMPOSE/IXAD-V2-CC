const express=require('express'),http=require('http'),{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static(__dirname));
let operator=null,call=null;
let announcements=[{id:1,title:'Welcome to IXADCC',message:'Welcome! IXADCC is online and ready for calls.',time:new Date().toISOString()}];
io.on('connection',s=>{
 s.on('operator-online',()=>{operator=s.id;io.emit('operator-status',{online:true});s.emit('announcements',announcements)});
 s.on('operator-offline',()=>{if(operator===s.id){operator=null;io.emit('operator-status',{online:false})}});
 s.on('get-announcements',()=>s.emit('announcements',announcements));
 s.on('publish-announcement',({title,message})=>{if(s.id!==operator)return;title=String(title||'').trim();message=String(message||'').trim();if(!title||!message)return;const item={id:Date.now(),title,message,time:new Date().toISOString()};announcements.unshift(item);announcements=announcements.slice(0,20);io.emit('announcement',item);io.emit('announcements',announcements)});
 s.on('call-ixadcc',()=>{if(!operator){s.emit('unavailable');return}if(call){s.emit('unavailable');return}call={caller:s.id,operator};io.to(operator).emit('incoming',{callerId:s.id})});
 s.on('answer',({callerId})=>{if(call&&call.caller===callerId&&call.operator===s.id)io.to(callerId).emit('answered',{operatorId:s.id})});
 s.on('signal',({to,data})=>io.to(to).emit('signal',{from:s.id,data}));
 s.on('hangup',()=>{if(call&&(s.id===call.caller||s.id===call.operator)){const other=s.id===call.caller?call.operator:call.caller;io.to(other).emit('ended');call=null}});
 s.on('disconnect',()=>{if(s.id===operator){operator=null;io.emit('operator-status',{online:false})}if(call&&(s.id===call.caller||s.id===call.operator)){const other=s.id===call.caller?call.operator:call.caller;io.to(other).emit('ended');call=null}});
});
app.get('/health',(req,res)=>res.json({ok:true,service:'IXADCC'}));
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`IXADCC running on ${PORT}`));

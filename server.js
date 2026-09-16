const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
app.use(express.static(__dirname));

const operators=new Map(); // socket id -> {name}
let activeCall=null; // {caller, operator, transferFrom:null}
let announcements=[{id:1,title:'Welcome to IXADCC',message:'Welcome! IXADCC is online and ready for calls.',time:new Date().toISOString()}];

function operatorList(){return [...operators.entries()].map(([id,v])=>({id,name:v.name}));}
function broadcastOperators(){io.emit('operators',operatorList());io.emit('operator-status',{online:operators.size>0,count:operators.size});}
function endActiveCall(reason='ended'){
  if(!activeCall)return;
  const c=activeCall;
  const other=c.caller;
  if(reason==='ended') io.to(other).emit('ended');
  if(c.operator) io.to(c.operator).emit('ended');
  activeCall=null;
}

io.on('connection',socket=>{
  socket.emit('operators',operatorList());
  socket.emit('operator-status',{online:operators.size>0,count:operators.size});
  socket.emit('announcements',announcements);

  socket.on('operator-online',payload=>{
    const name=String(payload?.name||'Operator').trim().slice(0,40)||'Operator';
    operators.set(socket.id,{name});
    socket.emit('operator-online-ok',{id:socket.id,name});
    broadcastOperators();
  });

  socket.on('operator-offline',()=>{
    operators.delete(socket.id);
    if(activeCall && activeCall.operator===socket.id) endActiveCall('ended');
    broadcastOperators();
  });

  socket.on('get-announcements',()=>socket.emit('announcements',announcements));
  socket.on('publish-announcement',({title,message})=>{
    if(!operators.has(socket.id))return;
    title=String(title||'').trim(); message=String(message||'').trim();
    if(!title||!message)return;
    const item={id:Date.now(),title,message,time:new Date().toISOString()};
    announcements.unshift(item); announcements=announcements.slice(0,20);
    io.emit('announcements',announcements); io.emit('announcement',item);
  });

  socket.on('call-ixadcc',()=>{
    if(!operators.size){socket.emit('unavailable');return;}
    if(activeCall){socket.emit('busy');return;}
    activeCall={caller:socket.id,operator:null,transferFrom:null};
    for(const id of operators.keys()) io.to(id).emit('incoming',{callerId:socket.id});
  });

  socket.on('answer',({callerId})=>{
    if(!activeCall || activeCall.caller!==callerId || activeCall.operator) return;
    if(!operators.has(socket.id)) return;
    activeCall.operator=socket.id;
    io.to(callerId).emit('answered',{operatorId:socket.id});
    for(const id of operators.keys()) if(id!==socket.id) io.to(id).emit('call-taken');
  });

  socket.on('decline',({callerId})=>{
    if(activeCall && activeCall.caller===callerId && !activeCall.operator){
      socket.emit('declined-confirmed');
    }
  });

  socket.on('transfer-request',({targetId})=>{
    if(!activeCall || activeCall.operator!==socket.id) return;
    if(!operators.has(targetId) || targetId===socket.id) return socket.emit('transfer-error',{message:'Choose another online operator.'});
    activeCall.transferFrom=socket.id;
    io.to(targetId).emit('transfer-offer',{callerId:activeCall.caller,fromId:socket.id,fromName:operators.get(socket.id)?.name||'Operator'});
    io.to(activeCall.caller).emit('transfer-start',{name:operators.get(targetId)?.name||'Operator'});
  });

  socket.on('transfer-accept',({callerId,fromId})=>{
    if(!activeCall || activeCall.caller!==callerId || activeCall.transferFrom!==fromId || !operators.has(socket.id)) return;
    const oldOperator=activeCall.operator;
    activeCall.operator=socket.id; activeCall.transferFrom=null;
    io.to(oldOperator).emit('transferred',{targetId:socket.id});
    io.to(callerId).emit('transfer-to',{operatorId:socket.id,name:operators.get(socket.id)?.name||'Operator'});
    io.to(socket.id).emit('transfer-connected',{callerId});
  });

  socket.on('transfer-decline',({callerId,fromId})=>{
    if(activeCall && activeCall.caller===callerId && activeCall.transferFrom===fromId){
      activeCall.transferFrom=null;
      io.to(fromId).emit('transfer-declined');
      io.to(callerId).emit('transfer-declined');
    }
  });

  socket.on('signal',({to,data})=>{
    if(!activeCall)return;
    const allowed=[activeCall.caller,activeCall.operator,activeCall.transferFrom].filter(Boolean);
    if(!allowed.includes(socket.id)||!allowed.includes(to))return;
    io.to(to).emit('signal',{from:socket.id,data});
  });

  socket.on('hangup',()=>{
    if(!activeCall)return;
    const c=activeCall;
    if(socket.id===c.caller || socket.id===c.operator){
      const other=socket.id===c.caller?c.operator:c.caller;
      if(other)io.to(other).emit('ended');
      if(c.transferFrom)io.to(c.transferFrom).emit('ended');
      activeCall=null;
    }
  });

  socket.on('disconnect',()=>{
    const wasOperator=operators.delete(socket.id);
    if(activeCall && (socket.id===activeCall.caller || socket.id===activeCall.operator || socket.id===activeCall.transferFrom)){
      const c=activeCall;
      const other=socket.id===c.caller?c.operator:c.caller;
      if(other)io.to(other).emit('ended');
      if(c.transferFrom && c.transferFrom!==socket.id)io.to(c.transferFrom).emit('ended');
      activeCall=null;
    }
    if(wasOperator)broadcastOperators();
  });
});

app.get('/health',(req,res)=>res.json({ok:true,service:'IXADCC V3',operators:operators.size,activeCall:!!activeCall}));
app.get('/',(req,res)=>res.sendFile(__dirname+'/caller.html'));
const PORT=process.env.PORT||8080;
server.listen(PORT,'0.0.0.0',()=>console.log(`IXADCC V3 running on ${PORT}`));

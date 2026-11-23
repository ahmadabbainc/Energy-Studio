(function(){
'use strict';
const $=id=>document.getElementById(id);
let files=[],busy=false,resultUrl='',resultName='energy-studio-joined-audio.wav';
const audioContext=()=>{const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error('This browser does not support audio decoding.');return new C();};
const fmtTime=s=>{if(!Number.isFinite(s))return '—';const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=Math.floor(s%60);return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');};
const bytes=n=>n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB';
function status(message,type){const el=$('ajStatus');el.textContent=message;el.className='tool-status '+(type||'');}
function clearResult(){if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl='';$('ajPreviewWrap').hidden=true;$('ajDownload').hidden=true;$('ajPreview').removeAttribute('src');}
function render(){
 const list=$('ajFileList');list.innerHTML='';
 files.forEach((file,index)=>{
  const row=document.createElement('div');row.className='aj-file-row';
  const info=document.createElement('div');info.className='aj-file-info';
  const name=document.createElement('strong');name.textContent=(index+1)+'. '+file.name;
  const meta=document.createElement('small');meta.textContent=bytes(file.size)+' · '+(file.type||'Audio file');
  info.append(name,meta);
  const actions=document.createElement('div');actions.className='aj-file-actions';
  const up=document.createElement('button');up.type='button';up.className='tool-btn';up.textContent='↑';up.title='Move up';up.disabled=index===0||busy;up.addEventListener('click',()=>move(index,-1));
  const down=document.createElement('button');down.type='button';down.className='tool-btn';down.textContent='↓';down.title='Move down';down.disabled=index===files.length-1||busy;down.addEventListener('click',()=>move(index,1));
  const remove=document.createElement('button');remove.type='button';remove.className='tool-btn';remove.textContent='Remove';remove.disabled=busy;remove.addEventListener('click',()=>{files.splice(index,1);clearResult();render();status(files.length?'File removed.':'Choose audio files to begin.');});
  actions.append(up,down,remove);row.append(info,actions);list.append(row);
 });
 $('ajFileCount').textContent=files.length?files.length+' audio file'+(files.length===1?'':'s')+' · '+bytes(files.reduce((n,f)=>n+f.size,0)):'No audio files selected';
 $('ajJoin').disabled=busy||files.length<2;
 $('ajClear').disabled=busy||!files.length;
}
function move(index,delta){const target=index+delta;if(target<0||target>=files.length)return;[files[index],files[target]]=[files[target],files[index]];clearResult();render();}
$('ajFiles').addEventListener('change',e=>{
 const incoming=Array.from(e.target.files||[]).filter(f=>f.type.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(f.name));
 if(!incoming.length){status('Choose supported audio files.','error');return;}
 const seen=new Set(files.map(f=>f.name+'|'+f.size+'|'+f.lastModified));
 for(const f of incoming){const k=f.name+'|'+f.size+'|'+f.lastModified;if(!seen.has(k)){files.push(f);seen.add(k);}}
 clearResult();render();status('Files added. Arrange their order, then join them.','success');e.target.value='';
});
$('ajClear').addEventListener('click',()=>{files=[];clearResult();render();status('Audio list cleared.');});
function wavHeader(dataBytes,sampleRate,channels){
 const b=new ArrayBuffer(44),v=new DataView(b),write=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
 write(0,'RIFF');v.setUint32(4,36+dataBytes,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,dataBytes,true);return b;
}
function encodeChunk(buffers,channels,sampleRate,startFrame,frameCount){
 const view=new DataView(new ArrayBuffer(frameCount*channels*2));let p=0;
 for(let i=0;i<frameCount;i++){
  const globalFrame=startFrame+i;let fileIndex=0;
  while(fileIndex<buffers.length-1&&globalFrame>=buffers[fileIndex].outStart+buffers[fileIndex].outFrames)fileIndex++;
  const item=buffers[fileIndex],local=globalFrame-item.outStart,position=local*item.buffer.sampleRate/sampleRate;
  const a=Math.min(item.buffer.length-1,Math.floor(position)),b=Math.min(item.buffer.length-1,a+1),mix=position-a;
  const sample=(ch)=>{const c=item.buffer.numberOfChannels===1?0:Math.min(ch,item.buffer.numberOfChannels-1);const data=item.buffer.getChannelData(c);return data[a]+(data[b]-data[a])*mix;};
  for(let ch=0;ch<channels;ch++){
   let value;if(channels===1&&item.buffer.numberOfChannels>1)value=(sample(0)+sample(1))*.5;else value=sample(ch);
   value=Math.max(-1,Math.min(1,value));view.setInt16(p,value<0?value*32768:value*32767,true);p+=2;
  }
 }
 return view.buffer;
}
async function join(){
 if(busy||files.length<2)return;busy=true;clearResult();render();$('ajProgressWrap').hidden=false;$('ajProgressFill').style.width='0%';
 let ctx;
 try{
  status('Reading and preparing audio files…');ctx=audioContext();const decoded=[];let maxRate=0,maxChannels=1,totalDuration=0;
  for(let i=0;i<files.length;i++){
   const file=files[i];status('Decoding '+(i+1)+' of '+files.length+': '+file.name);
   const raw=await file.arrayBuffer();const buffer=await ctx.decodeAudioData(raw.slice(0));
   decoded.push(buffer);maxRate=Math.max(maxRate,buffer.sampleRate);maxChannels=Math.max(maxChannels,Math.min(2,buffer.numberOfChannels));totalDuration+=buffer.duration;
   $('ajProgressFill').style.width=Math.round((i+1)/files.length*25)+'%';
  }
  const rate=Math.min(96000,maxRate),channels=maxChannels,totalFrames=Math.round(totalDuration*rate),dataBytes=totalFrames*channels*2;
  if(!Number.isSafeInteger(dataBytes)||dataBytes>1900000000)throw new Error('The joined WAV would be too large for a standard WAV file. Split the audio into smaller batches.');
  const prepared=[];let offset=0;
  decoded.forEach(buffer=>{const frames=Math.round(buffer.duration*rate);prepared.push({buffer,outStart:offset,outFrames:frames});offset+=frames;});
  const parts=[wavHeader(dataBytes,rate,channels)];const chunkFrames=131072;let done=0;
  for(let start=0;start<totalFrames;start+=chunkFrames){
   const count=Math.min(chunkFrames,totalFrames-start);parts.push(encodeChunk(prepared,channels,rate,start,count));done+=count;
   $('ajProgressFill').style.width=(25+Math.round(done/totalFrames*70))+'%';
   status('Joining audio… '+Math.round(done/totalFrames*100)+'%');
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  const blob=new Blob(parts,{type:'audio/wav'});resultUrl=URL.createObjectURL(blob);resultName='energy-studio-joined-audio.wav';
  $('ajPreview').src=resultUrl;$('ajPreviewWrap').hidden=false;$('ajDownload').hidden=false;$('ajDownload').onclick=()=>{const a=document.createElement('a');a.href=resultUrl;a.download=resultName;document.body.appendChild(a);a.click();a.remove();};
  $('ajProgressFill').style.width='100%';status('Joined '+files.length+' files · '+fmtTime(totalDuration)+' · '+channels+' channel'+(channels===1?'':'s')+' · '+bytes(blob.size)+' WAV','success');
 }catch(err){console.error('[Audio Joiner]',err);status(err&&err.message?err.message:'Could not join these audio files. Try converting them to MP3 or WAV first.','error');}
 finally{if(ctx)try{await ctx.close()}catch{}busy=false;$('ajProgressWrap').hidden=true;render();}
}
$('ajJoin').addEventListener('click',join);
render();
})();
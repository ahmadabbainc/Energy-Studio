(function(){
'use strict';
const $=id=>document.getElementById(id);
let files=[],previewFile=null,working=false,rootHandle=null;
const natural=s=>String(s).toLowerCase().replace(/\d+/g,n=>n.padStart(12,'0'));
function say(msg,type){$('splitStatus').textContent=msg;$('splitStatus').className='split-status '+(type||'');}
function even(n,len){return Array.from({length:n},(_,i)=>[Math.round(i*len/n),Math.round((i+1)*len/n)]);}
function ranges(p){
 const len=p.length,gutters=[];let start=-1;
 // A separator can be only one source pixel wide. The old 2px minimum
 // discarded those lines, which made 3-panel strips randomly become 2.
 const threshold=.90;
 for(let i=0;i<=len;i++){
  const bright=i<len&&p[i]>=threshold;
  if(bright&&start<0)start=i;
  if(!bright&&start>=0){gutters.push([start,i-1]);start=-1;}
 }
 // Join tiny breaks caused by antialiasing, compression, or a dark pixel
 // in an otherwise continuous thin separator.
 const merged=[];
 for(const g of gutters){
  const last=merged[merged.length-1];
  if(last&&g[0]-last[1]<=3)last[1]=g[1];else merged.push(g.slice());
 }
 const seg=[];let q=0;const minSeg=len*.055;
 for(const g of merged){
  if(g[0]-q>=minSeg)seg.push([q,g[0]]);
  q=g[1]+1;
 }
 if(len-q>=minSeg)seg.push([q,len]);
 // Ignore a false-positive line unless it produces at least two real panels.
 return seg.length>=2?seg:[[0,len]];
}
function detectGrid(ctx,w,h){
 // Keep more source detail so 1px gutters survive the analysis resize.
 const sc=Math.min(1,2200/Math.max(w,h)),cw=Math.max(1,Math.round(w*sc)),ch=Math.max(1,Math.round(h*sc));
 const c=document.createElement('canvas');c.width=cw;c.height=ch;
 const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(ctx.canvas,0,0,cw,ch);
 const px=x.getImageData(0,0,cw,ch).data,col=new Float32Array(cw),row=new Float32Array(ch);
 for(let y=0;y<ch;y++)for(let xx=0;xx<cw;xx++){
  const k=(y*cw+xx)*4,lum=px[k]*.3+px[k+1]*.59+px[k+2]*.11;
  if(lum>235){col[xx]++;row[y]++;}
 }
 for(let i=0;i<cw;i++)col[i]/=ch;
 for(let i=0;i<ch;i++)row[i]/=cw;
 const scale=r=>r.map(v=>[Math.max(0,Math.floor(v[0]/sc)),Math.min(w,Math.ceil(v[1]/sc))]);
 const scaleY=r=>r.map(v=>[Math.max(0,Math.floor(v[0]/sc)),Math.min(h,Math.ceil(v[1]/sc))]);
 return{xs:scale(ranges(col)),ys:scaleY(ranges(row))};
}
function getGrid(ctx,w,h){if($('splitMode').value==='auto'){const d=detectGrid(ctx,w,h);if(d.xs.length*d.ys.length>=2)return d;}return{xs:even(+$('splitCols').value,w),ys:even(+$('splitRows').value,h)};}
function drawPreview(){const canvas=$('splitPreview'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!previewFile){ctx.fillStyle='#111722';ctx.fillRect(0,0,canvas.width,canvas.height);return;}const img=previewFile,scale=Math.min(canvas.width/img.width,canvas.height/img.height),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale)),x=Math.round((canvas.width-w)/2),y=Math.round((canvas.height-h)/2);ctx.fillStyle='#111722';ctx.fillRect(0,0,canvas.width,canvas.height);const view=document.createElement('canvas');view.width=w;view.height=h;view.getContext('2d').drawImage(img,0,0,w,h);const clean=trimWhiteFrame(view),cw=clean.width,ch=clean.height,fit=Math.min(w/cw,h/ch),dw=Math.round(cw*fit),dh=Math.round(ch*fit),px=Math.round((canvas.width-dw)/2),py=Math.round((canvas.height-dh)/2),vctx=clean.getContext('2d',{willReadFrequently:true});ctx.drawImage(clean,px,py,dw,dh);const grid=getGrid(vctx,cw,ch);ctx.save();ctx.strokeStyle='#ff9b52';ctx.lineWidth=2;ctx.setLineDash([7,5]);grid.xs.slice(0,-1).forEach(r=>{const xx=px+r[1]*fit;ctx.beginPath();ctx.moveTo(xx,py);ctx.lineTo(xx,py+dh);ctx.stroke();});grid.ys.slice(0,-1).forEach(r=>{const yy=py+r[1]*fit;ctx.beginPath();ctx.moveTo(px,yy);ctx.lineTo(px+dw,yy);ctx.stroke();});ctx.restore();$('splitDimensions').textContent=img.width+' × '+img.height+' px';$('splitTileCount').textContent=(grid.xs.length*grid.ys.length)+' tiles in preview';}
function loadPreview(){if(!files.length){previewFile=null;drawPreview();return;}createImageBitmap(files[0]).then(b=>{previewFile?.close?.();previewFile=b;drawPreview();}).catch(()=>say('The first image could not be previewed.','error'));}
function renderFileInfo(){$('splitFileCount').textContent=files.length?files.length+' images selected':'No folder selected';$('splitFolderLabel').textContent=rootHandle?rootHandle.name:(files.length?(files[0]._relativePath||files[0].name).split('/')[0]:'Choose an images folder');$('splitGo').disabled=!files.length||working;loadPreview();}
async function collectImages(dir,prefix=''){for await(const [name,handle] of dir.entries()){if(name.toLowerCase()==='split')continue;const path=prefix?prefix+'/'+name:name;if(handle.kind==='directory')await collectImages(handle,path);else if(handle.kind==='file'&&/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)){const f=await handle.getFile();f._relativePath=path;files.push(f);}}}
async function chooseFolder(){if(!window.showDirectoryPicker){say('This browser does not support saving into the selected folder. Open SRT Studio in desktop Chrome or Edge.','error');return;}try{const dir=await window.showDirectoryPicker({mode:'readwrite'});rootHandle=dir;files=[];await collectImages(dir);files.sort((a,b)=>natural(a._relativePath).localeCompare(natural(b._relativePath)));renderFileInfo();say(files.length?files.length+' images ready. Output will be saved in '+dir.name+'/split.':'No image files found in that folder.',files.length?'':'error');}catch(e){if(e.name!=='AbortError')say('Could not open that folder: '+e.message,'error');}}
function trimBounds(ctx,x,y,w,h){const data=ctx.getImageData(x,y,w,h).data;const lum=(xx,yy)=>{const i=(yy*w+xx)*4;return data[i]*.3+data[i+1]*.59+data[i+2]*.11;};const col=i=>{if(i<0||i>=w)return false;let n=0;for(let j=0;j<h;j++)if(lum(i,j)<110)n++;return n/h>.6;};const row=j=>{if(j<0||j>=h)return false;let n=0;for(let i=0;i<w;i++)if(lum(i,j)<110)n++;return n/w>.6;};const cap=Math.max(8,Math.round(Math.min(w,h)*.025));const edgeOf=fn=>{let i=0;while(i<4&&!fn(i))i++;if(!fn(i))return 0;let j=i;while(j<=cap&&fn(j))j++;return j>cap?-1:j+1;};const v=[edgeOf(col),edgeOf(i=>col(w-1-i)),edgeOf(row),edgeOf(j=>row(h-1-j))],t=Math.max(...v);if(t<=0)return[0,0,w,h];for(let k=0;k<4;k++)if(v[k]<0)v[k]=t;const nw=w-v[0]-v[1],nh=h-v[2]-v[3];return nw<w*.5||nh<h*.5?[0,0,w,h]:[v[0],v[2],nw,nh];}
function trimWhiteFrame(canvas){
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;
 const data=ctx.getImageData(0,0,w,h).data,maxX=Math.floor(w*.06),maxY=Math.floor(h*.06);
 const whiteRow=y=>{let n=0;for(let x=0;x<w;x++){const k=(y*w+x)*4;if(data[k]>=242&&data[k+1]>=242&&data[k+2]>=242)n++;}return n/w>=.985;};
 const whiteCol=x=>{let n=0;for(let y=0;y<h;y++){const k=(y*w+x)*4;if(data[k]>=242&&data[k+1]>=242&&data[k+2]>=242)n++;}return n/h>=.985;};
 let top=0,bottom=0,left=0,right=0;
 while(top<maxY&&whiteRow(top))top++;
 while(bottom<maxY&&whiteRow(h-1-bottom))bottom++;
 while(left<maxX&&whiteCol(left))left++;
 while(right<maxX&&whiteCol(w-1-right))right++;
 if(top+bottom>=h*.5||left+right>=w*.5)return canvas;
 if(!top&&!bottom&&!left&&!right)return canvas;
 const out=document.createElement('canvas');out.width=w-left-right;out.height=h-top-bottom;
 out.getContext('2d').drawImage(canvas,left,top,out.width,out.height,0,0,out.width,out.height);
 return out;
}
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode an image tile.')),type,quality));}
async function writeTile(dir,name,blob){const handle=await dir.getFileHandle(name,{create:true}),writable=await handle.createWritable();await writable.write(blob);await writable.close();}
async function splitOne(file,out,counter){let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('Could not open '+file.name);}let src=document.createElement('canvas');src.width=bitmap.width;src.height=bitmap.height;let sc=src.getContext('2d',{willReadFrequently:true});sc.drawImage(bitmap,0,0);src=trimWhiteFrame(src);sc=src.getContext('2d',{willReadFrequently:true});const grid=getGrid(sc,src.width,src.height),ext=$('splitFormat').value,type=ext==='jpg'?'image/jpeg':'image/png';let count=0;for(const yr of grid.ys)for(const xr of grid.xs){let x=xr[0],y=yr[0],w=xr[1]-xr[0],h=yr[1]-yr[0];if(w<1||h<1)continue;if($('splitTrim').checked){const b=trimBounds(sc,x,y,w,h);x+=b[0];y+=b[1];w=b[2];h=b[3];}const pct=+$('splitEdge').value/100,dx=Math.round(w*pct),dy=Math.round(h*pct);x+=dx;y+=dy;w-=dx*2;h-=dy*2;if(w<8||h<8)continue;const tile=document.createElement('canvas');tile.width=w;tile.height=h;tile.getContext('2d').drawImage(src,x,y,w,h,0,0,w,h);const blob=await canvasBlob(tile,type,.95);await writeTile(out,String(++counter.value)+'.'+ext,blob);count++;}bitmap.close?.();return count;}
async function runSplit(){if(working||!files.length)return;if(!rootHandle){say('Choose the folder with the folder picker to allow saving into its split subfolder.','error');return;}working=true;$('splitGo').disabled=true;$('splitProgressWrap').hidden=false;$('splitProgressFill').style.width='0%';say('Preparing the split folder…');try{const out=await rootHandle.getDirectoryHandle('split',{create:true});let total=0;const counter={value:0};for(let i=0;i<files.length;i++){total+=await splitOne(files[i],out,counter);$('splitProgressFill').style.width=Math.round((i+1)/files.length*100)+'%';say('Splitting image '+(i+1)+' of '+files.length+' · '+total+' images saved');}if(!total)throw new Error('No tiles were created. Check the image and grid settings.');$('splitProgressFill').style.width='100%';say('Done. Saved '+total+' images, numbered 1 to '+total+', in '+rootHandle.name+'/split.','success');}catch(e){say(e.message||String(e),'error');}finally{working=false;$('splitGo').disabled=!files.length;}}
function init(){$('splitChooseFolder').addEventListener('click',chooseFolder);$('splitFolder').addEventListener('change',()=>say('Use the folder picker above; this browser file-input mode cannot save into the original folder.','error'));$('splitMode').addEventListener('change',()=>{$('splitGridSettings').hidden=$('splitMode').value==='auto';drawPreview();});['splitRows','splitCols','splitTrim','splitEdge','splitFormat'].forEach(id=>$(id).addEventListener('change',drawPreview));$('splitEdge').addEventListener('input',()=>{$('splitEdgeValue').textContent=(+$('splitEdge').value).toFixed(1)+'%';drawPreview();});$('splitGo').addEventListener('click',runSplit);$('splitGridSettings').hidden=$('splitMode').value==='auto';drawPreview();}
init();
})();
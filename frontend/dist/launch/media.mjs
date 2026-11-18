export const MAX_IMAGE_BYTES=2*1024*1024;
export const MAX_COVER_LENGTH=120000;
export function validCover(value){
 if(value==='')return true;
 if(typeof value!=='string'||value.length>MAX_COVER_LENGTH)return false;
 if(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value))return true;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
export function checkImageFile(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('image-type');
 if(!file.size||file.size>MAX_IMAGE_BYTES)throw Error('image-size');
}
export async function createLocalCover(file){
 checkImageFile(file);
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('image-read'));image.src=url;});
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('image-read');
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;
  const context=canvas.getContext('2d');if(!context)throw Error('image-read');
  context.fillStyle='#1a150e';context.fillRect(0,0,640,400);
  const scale=Math.min(640/image.naturalWidth,400/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  context.drawImage(image,(640-width)/2,(400-height)/2,width,height);
  for(const quality of [.8,.65,.5,.35]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=MAX_COVER_LENGTH&&validCover(result))return result;}
  throw Error('image-size');
 }finally{URL.revokeObjectURL(url);}
}

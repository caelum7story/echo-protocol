export function mintProgressView(snapshot={}){
 const capacity=10000,n=snapshot.totalMinted;
 const verified=snapshot.verified===true&&Number.isInteger(n)&&n>=0&&n<=capacity;
 return {verified,capacity,minted:verified?n:null,remaining:verified?capacity-n:null,percent:verified?(n/capacity*100).toFixed(2):null};
}

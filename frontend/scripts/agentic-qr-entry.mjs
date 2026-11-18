import QRCode from 'qrcode';
export const qrDataUrl=text=>QRCode.toDataURL(text,{width:288,margin:3,errorCorrectionLevel:'M',color:{dark:'#111111',light:'#ffffff'}});

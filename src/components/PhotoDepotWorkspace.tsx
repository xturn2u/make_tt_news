import { Download, FolderInput, ImagePlus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ProjectAsset, ProjectState } from '../domain/project';
import { uid } from '../domain/project';

type Props={project:ProjectState;setProject:React.Dispatch<React.SetStateAction<ProjectState>>};

function downloadAsset(asset:ProjectAsset){const a=document.createElement('a');a.href=asset.url;a.download=asset.name;a.click()}

export function PhotoDepotWorkspace({project,setProject}:Props){
  const [dragging,setDragging]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const items=project.assets.filter(asset=>asset.source==='photo-depot');
  const addFiles=(files:FileList|File[]|null)=>{
    if(!files)return;
    const images=Array.from(files).filter(file=>file.type.startsWith('image/'));
    if(!images.length)return;
    const added:ProjectAsset[]=images.map(file=>({id:uid('depot'),kind:'image',name:file.name,url:URL.createObjectURL(file),mime:file.type,size:file.size,source:'photo-depot'}));
    setProject(current=>({...current,assets:[...added,...current.assets]}));
  };
  const remove=(id:string)=>setProject(current=>{
    const target=current.assets.find(asset=>asset.id===id);
    if(target?.url.startsWith('blob:'))URL.revokeObjectURL(target.url);
    return {...current,assets:current.assets.filter(asset=>asset.id!==id)};
  });
  const promote=(id:string)=>setProject(current=>({...current,assets:current.assets.map(asset=>asset.id===id?{...asset,source:'depot-approved'}:asset)}));

  return <div className="workspace-section photo-depot-workspace">
    <div className="callout depot-callout"><FolderInput size={18}/><div><b>Foto-Zwischendepot</b><span>Hier liegen unbearbeitete Fotos. Sie erscheinen noch nicht im Studio, bis du sie in die Assets übernimmst.</span></div></div>
    <div className={`photo-depot-dropzone ${dragging?'dragging':''}`} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files)}} onClick={()=>inputRef.current?.click()}>
      <Upload size={20}/><div><b>Fotos hier ablegen</b><span>Drag & Drop oder klicken · nur Bilddateien</span></div>
    </div>
    <input ref={inputRef} hidden type="file" multiple accept="image/*" onChange={e=>addFiles(e.target.files)}/>
    <div className="photo-depot-summary"><span>{items.length} Foto{items.length===1?'':'s'} im Depot</span><button onClick={()=>inputRef.current?.click()}><ImagePlus size={14}/>Fotos hinzufügen</button></div>
    <div className="photo-depot-gallery">
      {items.map(asset=><article key={asset.id} className="photo-depot-card"><img src={asset.url} alt=""/><div className="photo-depot-meta"><b>{asset.name}</b><small>{asset.size?`${(asset.size/1048576).toFixed(1)} MB`:'Foto'}</small></div><div className="photo-depot-actions"><button title="Download" onClick={()=>downloadAsset(asset)}><Download size={13}/></button><button onClick={()=>promote(asset.id)}>Zu Assets</button><button className="danger-icon" title="Löschen" onClick={()=>remove(asset.id)}><Trash2 size={13}/></button></div></article>)}
      {!items.length&&<div className="empty-state">Noch keine Fotos im Zwischendepot.</div>}
    </div>
  </div>;
}

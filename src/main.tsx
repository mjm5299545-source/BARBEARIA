import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {api,type PublicData} from './api';
import {PublicSite} from './Public';
import {ManageBooking} from './Booking';
import {Admin} from './admin/Admin';
import {Brand,Spinner,ErrorBox} from './components';
import './style.css';
import './public.css';
import './experience.css';
function App(){const [data,setData]=useState<PublicData|null>(null),[error,setError]=useState('');useEffect(()=>{const load=()=>api<PublicData>('/public').then(r=>{setData(r);setError('');}).catch(e=>setError(e.message));void load();window.addEventListener('focus',load);return()=>window.removeEventListener('focus',load);},[]);useEffect(()=>{if(window.location.pathname.startsWith('/admin')||window.location.pathname==='/reserva'){const robots=document.createElement('meta');robots.name='robots';robots.content='noindex, nofollow';document.head.append(robots);return()=>robots.remove();}},[]);useEffect(()=>{if(!data)return;const script=document.createElement('script');script.type='application/ld+json';script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'HairSalon',name:'Barbearia Grecco',address:{'@type':'PostalAddress',streetAddress:data.settings.address,addressLocality:'Propriá',addressRegion:'SE',postalCode:data.settings.postcode,addressCountry:'BR'},geo:{'@type':'GeoCoordinates',latitude:data.settings.latitude,longitude:data.settings.longitude}});document.head.append(script);return()=>script.remove();},[data]);if(window.location.pathname.startsWith('/admin'))return <Admin/>;if(!data)return <div className="loading-page"><Brand/>{error?<><ErrorBox message={error}/><button className="button gold" onClick={()=>window.location.reload()}>Tentar novamente</button></>:<Spinner/>}</div>;if(window.location.pathname==='/reserva')return <ManageBooking data={data}/>;return <><ErrorBox message={error}/><PublicSite data={data}/></>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowRight,ArrowUpRight,MapPin,Clock,Menu,X,MessageCircle,Instagram,Plus,ShieldCheck} from 'lucide-react';
import {money,type PublicData,type Gallery} from './api';
import {Brand,Dialog,SectionTitle} from './components';
import {Booking} from './Booking';
import {useEditorialMotion} from './useEditorialMotion';

const navigation=[['Início','inicio'],['A Grecco','sobre'],['Serviços','servicos'],['Galeria','galeria'],['Localização','localizacao']] as const;
const referenceGallery:Gallery[]=[
  {id:'ref1',url:'/images/detail.webp',alt:'Referência visual de técnica de corte. Imagem ilustrativa gerada.',position:0},
  {id:'ref2',url:'/images/atmosphere.webp',alt:'Referência de atmosfera para a Grecco. Imagem ilustrativa gerada.',position:1},
  {id:'ref3',url:'/images/hero.webp',alt:'Referência de atendimento e acabamento. Imagem ilustrativa gerada.',position:2},
];

export function PublicSite({data,preview=false}:{data:PublicData;preview?:boolean}){
  const {settings:s,services,gallery}=data;
  const root=useRef<HTMLDivElement>(null);
  const menuButton=useRef<HTMLButtonElement>(null);
  const [menu,setMenu]=useState(false);
  const [booking,setBooking]=useState<string[]|null>(null);
  const [category,setCategory]=useState('Todos');
  const [photo,setPhoto]=useState<Gallery|null>(null);
  const [privacy,setPrivacy]=useState(false);
  const [map,setMap]=useState(false);
  const [scrolled,setScrolled]=useState(false);
  const [activeSection,setActiveSection]=useState('inicio');
  const [mobileBookingVisible,setMobileBookingVisible]=useState(false);
  useEditorialMotion(root);

  useEffect(()=>{
    const update=()=>setScrolled(window.scrollY>45);
    update();window.addEventListener('scroll',update,{passive:true});
    return()=>window.removeEventListener('scroll',update);
  },[]);
  useEffect(()=>{
    if(preview||!('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting)setActiveSection(entry.target.id);});
    },{rootMargin:'-15% 0px -55% 0px',threshold:0});
    root.current?.querySelectorAll<HTMLElement>('section[id]').forEach(section=>observer.observe(section));
    return()=>observer.disconnect();
  },[preview]);
  useEffect(()=>{
    if(preview)return;
    const actions=root.current?.querySelector('.hero-actions');
    if(!actions)return;
    if(!('IntersectionObserver' in window)){setMobileBookingVisible(true);return;}
    const observer=new IntersectionObserver(([entry])=>setMobileBookingVisible(!entry.isIntersecting&&entry.boundingClientRect.top<0));
    observer.observe(actions);
    return()=>observer.disconnect();
  },[preview]);
  useEffect(()=>{
    if(!menu)return;
    const dismiss=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setMenu(false);menuButton.current?.focus();}
    };
    window.addEventListener('keydown',dismiss);
    return()=>window.removeEventListener('keydown',dismiss);
  },[menu]);

  const filtered=services.filter(service=>category==='Todos'||(category==='Combos'?service.kind==='combo':service.kind==='individual'));
  const wa=s.whatsapp?`https://wa.me/${s.whatsapp}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre os serviços da Barbearia Grecco.')}`:'';
  const routes=`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`;
  const openBooking=(ids:string[]=[])=>{setMenu(false);setBooking(ids);};

  return <div ref={root} className="public-site" style={{'--gold':s.accent==='#C6A45E'?'#C6A667':s.accent} as React.CSSProperties}>
    {preview&&<div className="preview-banner">PRÉVIA DO CONTEÚDO · alterações ainda não publicadas</div>}
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <header className={`site-header${scrolled?' scrolled':''}${menu?' menu-open':''}`}>
      <div className="header-inner">
        <Brand logo={s.logo}/>
        <nav id="grecco-navigation" className={`public-nav${menu?' open':''}`} aria-label="Navegação principal">
          {navigation.map(([label,id])=><a key={id} href={`#${id}`} aria-current={activeSection===id?'location':undefined} onClick={()=>setMenu(false)}>{label}</a>)}
        </nav>
        <button className="button header-cta" onClick={()=>openBooking()}>Agendar horário <ArrowUpRight size={17}/></button>
        <button ref={menuButton} className="icon-button mobile-menu" aria-label={menu?'Fechar menu':'Abrir menu'} aria-expanded={menu} aria-controls="grecco-navigation" onClick={()=>setMenu(!menu)}>{menu?<X size={22}/>:<Menu size={22}/>}</button>
      </div>
    </header>
    <main id="conteudo">
      <section className="hero" id="inicio">
        <img className="hero-image" src={s.heroImage||'/images/hero.webp'} alt="Imagem ilustrativa de um atendimento em barbearia, criada para a identidade visual Grecco" fetchPriority="high"/>
        <div className="hero-shade"/>
        <div className="hero-content container">
          <div className="hero-eyebrow"><span/> ESTILO É IDENTIDADE. O RESTO É DETALHE.</div>
          <h1>{s.heroTitle.split('\n').map((line,i)=><span key={i} className={i===1?'hero-emphasis':''}>{line}</span>)}</h1>
          <p>{s.heroSubtitle}</p>
          <div className="hero-actions">
            <button className="button gold large" onClick={()=>openBooking()}>{s.primaryCta||'Agendar meu horário'} <ArrowUpRight size={19}/></button>
            {wa?<a className="button hero-secondary" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={17}/> Falar no WhatsApp</a>:<a className="button hero-secondary" href="#servicos">{s.secondaryCta||'Conhecer os serviços'} <ArrowRight size={17}/></a>}
          </div>
          <div className="hero-location"><MapPin size={14}/><span>PROPRIÁ, SERGIPE</span><i/><span>CUIDADO EM CADA DETALHE</span></div>
        </div>
        <div className="hero-caption"><span className="caption-mark">G.</span><div>Seu momento.<br/><strong>Seu melhor estilo.</strong></div></div>
        <a href="#sobre" className="scroll-cue"><span>DESCUBRA A GRECCO</span><ArrowDown size={16}/></a>
        <span className="hero-side">TRADIÇÃO NO CUIDADO. PERSONALIDADE NO ESTILO.</span>
      </section>

      <div className="promise-strip"><div className="container">
        {['Precisão em cada corte','Cuidado nos detalhes','A sua melhor versão'].map((title,i)=><div key={title}><span className="promise-index" aria-hidden="true">0{i+1}</span><span>{title}</span></div>)}
        <a href="#localizacao">NO CORAÇÃO DE PROPRIÁ <ArrowUpRight size={16}/></a>
      </div></div>

      <section className="section about container" id="sobre">
        <div className="about-visual" data-reveal>
          <div className="about-image-wrap"><img src="/images/detail.webp" alt="Detalhe ilustrativo do cuidado com o corte de cabelo" loading="lazy"/></div>
          <div className="about-image-caption"><span>GRECCO / O SEU ESTILO, EM BOAS MÃOS.</span><span>IMAGEM ILUSTRATIVA</span></div>
        </div>
        <div className="about-copy" data-reveal>
          <span className="section-index" aria-hidden="true">01 — A GRECCO</span>
          <SectionTitle label="BEM-VINDO À GRECCO" title={s.aboutTitle}/>
          <p>{s.aboutText}</p>
          <div className="about-values"><span>Atendimento com atenção</span><span>Estilo com personalidade</span></div>
          <a href="#localizacao" className="text-link editorial-link">Conheça nosso espaço <ArrowUpRight size={18}/></a>
        </div>
      </section>

      <section className="services-section section" id="servicos"><div className="container">
        <div className="section-heading" data-reveal>
          <div className="services-intro"><span className="section-index" aria-hidden="true">02 — NOSSO OFÍCIO</span><SectionTitle label="NOSSO OFÍCIO" title="Um cuidado. Muitas possibilidades." description="Do primeiro detalhe ao toque final, encontre o serviço para o seu momento."/></div>
          <div className="segment service-filter" aria-label="Filtrar serviços">{['Todos','Individuais','Combos'].map(c=><button key={c} className={category===c?'active':''} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        </div>
        <div className="service-grid">
          {filtered.map((service,i)=><article className={`service-card${service.kind==='combo'||service.featured?' featured':''}`} key={service.id}>
            <span className="service-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>
            <div className="service-name">{service.image&&<img className="service-photo" src={service.image} alt={service.name} loading="lazy"/>}<div><h3>{service.name}</h3>{(service.kind==='combo'||service.featured)&&<span className="service-tag">{service.kind==='combo'?'EXPERIÊNCIA COMPLETA':'EM DESTAQUE'}</span>}</div></div>
            <p>{service.description}</p>
            <div className="service-meta"><strong>{money(service.price)}</strong><span>{service.configured?<><Clock size={12}/>{service.duration} min</>:'Cuidado sob medida'}</span></div>
            <button className="service-book" onClick={()=>openBooking([service.id])}><span>Agendar serviço</span><span className="service-arrow"><ArrowUpRight size={20}/></span></button>
          </article>)}
        </div>
        <p className="section-footnote">Seu estilo é único. Se precisar de orientação, vamos encontrar o cuidado ideal para você.</p>
      </div></section>

      <section className="section gallery-section container" id="galeria">
        <div className="section-heading" data-reveal>
          <div><span className="section-index" aria-hidden="true">03 — EM DETALHE</span><SectionTitle label="O ESTILO ESTÁ NOS DETALHES" title="Inspiração para o seu próximo visual." description="Referências de estilo, técnica e cuidado. Um convite para se reinventar."/></div>
          {s.instagram&&<a className="text-link editorial-link" href={`https://instagram.com/${s.instagram}`} target="_blank" rel="noreferrer"><Instagram size={17}/> Acompanhe a Grecco <ArrowUpRight size={17}/></a>}
        </div>
        <div className="gallery-grid">
          {(gallery.length?gallery:referenceGallery).map((g,i)=><figure className={`gallery-entry entry-${i%3}`} key={g.id} data-reveal>
            <button className={`gallery-tile tile-${i%3}`} onClick={()=>setPhoto(g)} aria-label={`Ampliar: ${g.alt}`}><img src={g.url} alt={g.alt} loading="lazy"/><span className="gallery-expand"><Plus size={21}/></span>{!gallery.length&&<span className="gallery-image-note">IMAGEM ILUSTRATIVA</span>}</button>
            <figcaption><span>{gallery.length?g.alt:['A arte do corte','O seu momento','Precisão e personalidade'][i]}</span><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span></figcaption>
          </figure>)}
        </div>
        {!gallery.length&&<p className="photo-disclaimer">Imagens ilustrativas criadas para o site. As fotos da barbearia serão adicionadas em breve.</p>}
      </section>

      <section className="booking-banner container" data-reveal>
        <div className="booking-banner-copy"><p className="eyebrow">UM TEMPO PARA CUIDAR DE VOCÊ</p><h2>Seu próximo visual<br/>começa com um <em>horário.</em></h2></div>
        <div className="booking-banner-action"><p>Reserve seu momento.<br/>A gente cuida dos detalhes.</p><button className="button gold large" onClick={()=>openBooking()}>Quero agendar <ArrowUpRight size={19}/></button></div>
      </section>

      <section className="section location container" id="localizacao">
        <div className="location-copy" data-reveal>
          <span className="section-index" aria-hidden="true">04 — PROPRIÁ, SERGIPE</span>
          <SectionTitle label="A GENTE SE ENCONTRA AQUI" title="Seu novo ponto de encontro."/>
          <p className="location-intro">Na cidade de Propriá, um espaço para renovar o visual e se sentir em casa.</p>
          <div className="contact-item"><MapPin size={19}/><div><h3>Venha para a Grecco</h3><p>{s.address}<br/>{s.city} · CEP {s.postcode}</p><a className="text-link editorial-link" href={routes} target="_blank" rel="noreferrer">Traçar rota <ArrowUpRight size={16}/></a></div></div>
          <div className="contact-item"><Clock size={19}/><div><h3>Horário de funcionamento</h3><p className="multiline">{s.hoursLabel}</p></div></div>
          {wa&&<div className="contact-item"><MessageCircle size={19}/><div><h3>Vamos conversar?</h3><a className="text-link editorial-link" href={wa} target="_blank" rel="noreferrer">Falar no WhatsApp <ArrowUpRight size={16}/></a></div></div>}
          {s.phone&&<a className="text-link contact-phone" href={`tel:${s.phone.replace(/[^+\d]/g,'')}`}>{s.phone}</a>}
        </div>
        <div className="map-panel" data-reveal>
          {map?<iframe title="Localização da Barbearia Grecco no Google Maps" src={`https://www.google.com/maps?q=${s.latitude},${s.longitude}&z=17&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/>:<>
            <div className="location-coordinate"><span>PROPRIÁ / SE</span><span>{Math.abs(s.latitude).toFixed(4)}° {s.latitude<0?'S':'N'} &nbsp; {Math.abs(s.longitude).toFixed(4)}° {s.longitude<0?'W':'E'}</span></div>
            <div className="location-mark"><MapPin size={36} strokeWidth={1}/><span>Grecco.</span><p>{s.address}<br/>{s.city}</p></div>
            <div className="map-overlay"><button className="button outline" onClick={()=>setMap(true)}>Carregar mapa <ArrowUpRight size={17}/></button><small>Ao carregar, você se conecta ao Google Maps.</small></div>
            <span className="location-river">RIO SÃO FRANCISCO</span>
          </>}
        </div>
      </section>
    </main>

    <footer className="site-footer"><div className="container">
      <div className="footer-top">
        <div className="footer-brand"><Brand logo={s.logo}/><p>Seu estilo. Sua assinatura.</p></div>
        <nav aria-label="Links do rodapé"><a href="#sobre">A Grecco</a><a href="#servicos">Serviços</a><button onClick={()=>openBooking()}>Agendamento</button><a href="#localizacao">Localização</a></nav>
        <div className="footer-place"><span>FEITO PARA VOCÊ. EM PROPRIÁ.</span><p>{s.address}<br/>{s.city}, Brasil</p>{s.instagram&&<a className="text-link" href={`https://instagram.com/${s.instagram}`} target="_blank" rel="noreferrer"><Instagram size={16}/><span>Instagram</span><ArrowUpRight size={14}/></a>}</div>
      </div>
      <div className="footer-signature" aria-hidden="true">GRECCO</div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Barbearia Grecco. Todos os direitos reservados.</span><div><button onClick={()=>setPrivacy(true)}>Privacidade</button><a href="/admin">Área administrativa <ArrowUpRight size={12}/></a></div></div>
    </div></footer>

    <button className={`mobile-book button gold${mobileBookingVisible?' visible':''}`} aria-hidden={!mobileBookingVisible} tabIndex={mobileBookingVisible?0:-1} onClick={()=>openBooking()}><span>Agendar meu horário</span><ArrowUpRight size={19}/></button>
    {booking&&<Booking data={data} initial={booking} onClose={()=>setBooking(null)}/>}
    {photo&&<Dialog title="O estilo mora nos detalhes." onClose={()=>setPhoto(null)} wide><img className="lightbox-image" src={photo.url} alt={photo.alt}/><p className="muted">{photo.alt}</p></Dialog>}
    {privacy&&<Dialog title="Sua privacidade importa." onClose={()=>setPrivacy(false)}><div className="privacy-copy"><p>A Barbearia Grecco utiliza seu nome e telefone exclusivamente para organizar e prestar o atendimento solicitado. Não vendemos seus dados e não enviamos mensagens automáticas sem uma integração configurada.</p><h3>Reservas e segurança</h3><p>Seu link privado dá acesso à reserva. Guarde-o com cuidado. O painel com dados de clientes é restrito à administração, com sessão de acesso protegida.</p><h3>Retenção e seus direitos</h3><p>Reservas encerradas podem ter seus dados pessoais removidos após {s.retentionDays} dias, conforme revisão da administração. Você pode solicitar acesso, correção ou exclusão dos seus dados {s.privacyContact?`pelo contato ${s.privacyContact}`:'presencialmente na barbearia, no endereço informado neste site'}.</p><h3>Cookies e serviços externos</h3><p>Usamos apenas um cookie necessário para a sessão administrativa. O mapa é carregado somente quando solicitado. Links para Google, Instagram e WhatsApp seguem as políticas desses serviços.</p><p><ShieldCheck size={16}/> Coletamos apenas o necessário para cuidar do seu atendimento.</p></div></Dialog>}
  </div>;
}

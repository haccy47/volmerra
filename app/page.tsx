"use client";

import { useState } from "react";
import { Cinzel, Montserrat } from "next/font/google";

const titleFont = Cinzel({
  subsets:["latin"],
  weight:["700"],
});

const textFont = Montserrat({
  subsets:["latin"],
  weight:["400","600","700"],
});


export default function Home(){

const [search,setSearch]=useState("");
const [hover,setHover]=useState("");

const menu=[
{title:"📖 Hikayeler",link:"/hikaye"},
{title:"🗺️ Harita",link:"/harita"},
{title:"💎 Taşlar",link:"/taslar"},
{title:"👥 Karakterler",link:"/karakterler"},
];


const episodes=[
"S3 B4 - Anne ve Üç Kızı",
"S3 B3 - Raven",
"S3 B2 - Yanardağ"
];


return(

<main
className={textFont.className}
style={{
minHeight:"100vh",
background:"#fff",
color:"#3b2412",
}}
>


<header

style={{
position:"fixed",
top:0,
left:0,
width:"100%",
height:85,
background:"white",
display:"flex",
alignItems:"center",
justifyContent:"space-between",
padding:"0 40px",
boxShadow:"0 5px 20px rgba(0,0,0,.15)",
zIndex:100,
}}

>


<h1
className={titleFont.className}
style={{
color:"#b98a2e",
fontSize:30,
}}
>
📜 Volmerra
</h1>



<input

value={search}

onChange={(e)=>setSearch(e.target.value)}

placeholder="🔍 Volmerra'da ara..."

style={{
width:350,
padding:12,
borderRadius:20,
border:"2px solid #b98a2e",
outline:"none",
fontSize:16,
}}

/>




<nav

style={{
display:"flex",
alignItems:"center",
gap:15,
}}

>


{menu.map(item=>(

<button

key={item.title}

onMouseEnter={()=>setHover(item.title)}
onMouseLeave={()=>setHover("")}

onClick={()=>window.location.href=item.link}

style={{
border:"none",
background:hover===item.title?"#b98a2e":"white",
color:hover===item.title?"white":"#3b2412",
padding:"12px 15px",
borderRadius:10,
cursor:"pointer",
transition:".2s",
fontWeight:600,
}}

>

{item.title}

</button>

))}



<button

onMouseEnter={()=>setHover("hesap")}
onMouseLeave={()=>setHover("")}

style={{
border:"2px solid #b98a2e",
background:hover==="hesap"?"#b98a2e":"white",
color:hover==="hesap"?"white":"#b98a2e",
padding:"12px 18px",
borderRadius:10,
cursor:"pointer",
fontWeight:700,
}}

>

Hesap Oluştur

</button>



</nav>



</header>






<section

style={{
paddingTop:150,
textAlign:"center",
}}

>


<h2

className={titleFont.className}

style={{
fontSize:80,
color:"#b98a2e",
}}

>

Volmerra I

</h2>



<p
style={{
fontSize:22,
}}
>
Fanilerin, Büyülülerin ve Efsanelerin Dünyası
</p>



</section>







<section

style={{
padding:"50px",
}}

>


<h2

className={titleFont.className}
style={{
fontSize:40,
}}
>

📖 Son Bölümler

</h2>




<div

style={{
display:"grid",
gridTemplateColumns:"repeat(3,1fr)",
gap:25,
marginTop:30,
}}

>


{episodes.map((ep,i)=>(

<div

key={ep}

style={{
height:250,
border:"2px solid #b98a2e",
borderRadius:15,
background:"#fafafa",
cursor:"pointer",
transition:".3s",
}}

onMouseEnter={(e)=>{
e.currentTarget.style.transform="translateY(-8px)";
e.currentTarget.style.boxShadow="0 10px 25px rgba(185,138,46,.4)";
}}

onMouseLeave={(e)=>{
e.currentTarget.style.transform="translateY(0)";
e.currentTarget.style.boxShadow="none";
}}

>


<div
style={{
height:"70%",
background:"#ddd",
}}
>


</div>


<h3>
{ep}
</h3>


</div>

))}



</div>


</section>




</main>


)

}
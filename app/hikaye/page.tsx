"use client";

import { useState } from "react";
import { Cinzel } from "next/font/google";

const cinzel = Cinzel({
  subsets:["latin"],
  weight:["700"],
});


const seasons = [
  {
    name:"Sezon 1",
    episodes:[
      {
        code:"S1 B1",
        title:"Başlangıç",
        desc:"Volmerra dünyasının ilk adımları atılıyor."
      },
      {
        code:"S1 B2",
        title:"İlk Taş",
        desc:"Element güçlerinin sırrı ortaya çıkıyor."
      }
    ]
  },


  {
    name:"Sezon 2",
    episodes:[
      {
        code:"S2 B1",
        title:"Yeni Tehdit",
        desc:"Karanlık güçler yeniden hareket ediyor."
      },
      {
        code:"S2 B2",
        title:"Kayıp Güç",
        desc:"Efsanelerin geçmişi araştırılıyor."
      }
    ]
  },


  {
    name:"Sezon 3",
    episodes:[
      {
        code:"S3 B1",
        title:"Layık Olan",
        desc:"Karataş seçimi başlıyor."
      },
      {
        code:"S3 B2",
        title:"Yanardağ",
        desc:"Lex'in gücü dünyayı değiştirmeye başlıyor."
      },
      {
        code:"S3 B3",
        title:"Raven",
        desc:"Yeni bir düşman kahramanları sınar."
      },
      {
        code:"S3 B4",
        title:"Anne ve Üç Kızı",
        desc:"Spedder'ın geçmişindeki sırlar ortaya çıkar."
      }
    ]
  }
];



export default function Hikaye(){

const [search,setSearch]=useState("");

return(

<main

style={{
minHeight:"100vh",
color:"white",
padding:"40px 20px",
background:
"linear-gradient(rgba(0,0,0,.7),rgba(0,0,0,.85)),url('/images/volmerra.jpg')",
backgroundSize:"cover",
backgroundAttachment:"fixed",
}}

>


<h1

className={cinzel.className}

style={{
textAlign:"center",
fontSize:"clamp(45px,8vw,80px)",
color:"#d6a62a",
}}

>

Volmerra Hikayeleri

</h1>



<p
style={{
textAlign:"center",
fontSize:20,
}}
>
Tüm sezonları ve bölümleri keşfet
</p>



{/* ARAMA */}

<div
style={{
display:"flex",
justifyContent:"center",
margin:"40px 0",
}}
>

<input

placeholder="Bölüm ara..."

value={search}

onChange={(e)=>setSearch(e.target.value)}

style={{
width:400,
padding:15,
borderRadius:12,
border:"2px solid #b98a2e",
background:"#1a120c",
color:"white",
fontSize:18,
textAlign:"center",
}}

/>

</div>





{seasons.map(season=>(


<section

key={season.name}

style={{
maxWidth:1000,
margin:"60px auto",
}}

>


<h2

className={cinzel.className}

style={{
fontSize:40,
color:"#d6a62a",
borderBottom:"2px solid #b98a2e",
paddingBottom:10,
}}

>

{season.name}

</h2>




<div

style={{
display:"flex",
flexDirection:"column",
gap:35,
marginTop:30,
}}

>


{season.episodes

.filter(ep=>
(ep.title+ep.code)
.toLowerCase()
.includes(search.toLowerCase())
)

.map(ep=>(


<div

key={ep.code}

style={{
background:"#1a120c",
border:"2px solid #b98a2e",
borderRadius:20,
overflow:"hidden",
transition:"transform .2s",
cursor:"pointer",
}}


onMouseEnter={(e)=>
e.currentTarget.style.transform="scale(1.03)"
}

onMouseLeave={(e)=>
e.currentTarget.style.transform="scale(1)"
}


>


{/* BANNER */}

<div

style={{
height:230,
background:
"linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.75)),url('/images/volmerra.jpg')",
backgroundSize:"cover",
backgroundPosition:"center",
}}

>



</div>





<div
style={{
padding:25,
}}
>


<h3
className={cinzel.className}
style={{
fontSize:28,
color:"#d6a62a",
}}
>
{ep.code} - {ep.title}
</h3>



<p>
{ep.desc}
</p>



<button

style={{
marginTop:15,
padding:"10px 25px",
background:"#8a5a00",
color:"white",
border:"1px solid #d6a62a",
borderRadius:10,
cursor:"pointer",
}}

>

Bölümü Aç

</button>


</div>


</div>


))}



</div>


</section>


))}


</main>

)

}
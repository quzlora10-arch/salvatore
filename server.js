const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "data", "salvatore.json");

function freshDB(){
  return {users:[],channels:[],videos:[],comments:[],subscriptions:[],verification_codes:[],
    counters:{users:1,channels:1,videos:1,comments:1}};
}
let db;
try { db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE,"utf8")) : freshDB(); }
catch(e){ db=freshDB(); }
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2),"utf8"); }
function next(k){ var n=db.counters[k]||1; db.counters[k]=n+1; return n; }
function findUser(id){ return db.users.find(function(u){return u.id===Number(id);}); }
function findByEmail(email){ return db.users.find(function(u){return u.email===email;}); }
function findByNick(nick){ return db.users.find(function(u){return u.nickname.toLowerCase()===nick.toLowerCase();}); }
function channelFor(uid){ return db.channels.find(function(c){return c.user_id===Number(uid);}); }

if(!db.users.length){
  var adminEmail=process.env.ADMIN_EMAIL||"admin@salvatore.local";
  var adminPassword=process.env.ADMIN_PASSWORD||"ChangeMe123!";
  var au={id:next("users"),email:adminEmail,nickname:"admin",password_hash:bcrypt.hashSync(adminPassword,12),is_admin:1,verified:1,created_at:new Date().toISOString()};
  db.users.push(au);
  db.channels.push({id:next("channels"),user_id:au.id,name:"Salvatore Admin",description:"Yönetici kanalı",avatar:"",banner:"",subscribers:0});
  save();
}

app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(cookieParser());
app.use(session({secret:process.env.SESSION_SECRET||"salvatore-change-this",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:false,maxAge:604800000}}));
app.use(express.static(path.join(__dirname,"public")));
app.use("/uploads",express.static(path.join(__dirname,"public","uploads")));

var storage=multer.diskStorage({
  destination:function(req,file,cb){cb(null,path.join(__dirname,"public","uploads"));},
  filename:function(req,file,cb){cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname).toLowerCase());}
});
var upload=multer({storage:storage,limits:{fileSize:2*1024*1024*1024}});

function auth(req,res,next){
  if(!req.session.userId)return res.status(401).json({error:"Giriş yapmalısınız."});
  next();
}
function admin(req,res,next){
  var u=findUser(req.session.userId);
  if(!u || !u.is_admin)return res.status(403).json({error:"Yetkisiz."});
  next();
}
function cleanEmail(v){return String(v||"").trim().toLowerCase();}
function validNick(v){return /^[a-zA-Z0-9_.-]{3,30}$/.test(v||"");}

app.get("/api/me",function(req,res){
  var u=findUser(req.session.userId);
  if(!u)return res.json({user:null});
  res.json({user:{id:u.id,email:u.email,nickname:u.nickname,is_admin:u.is_admin,verified:u.verified}});
});

app.post("/api/register/send-code",async function(req,res){
  var email=cleanEmail(req.body.email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Geçerli bir e-posta girin."});
  if(findByEmail(email))return res.status(409).json({error:"Bu e-posta zaten kayıtlı."});
  var code=String(Math.floor(100000+Math.random()*900000));
  db.verification_codes=db.verification_codes.filter(function(x){return x.email!==email;});
  db.verification_codes.push({id:Date.now(),email:email,code:code,expires_at:Date.now()+600000});
  save();
  try{
    if(process.env.SMTP_HOST){
      var transporter=nodemailer.createTransport({
        host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
        secure:process.env.SMTP_SECURE==="true",
        auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
      });
      await transporter.sendMail({
        from:process.env.SMTP_FROM||process.env.SMTP_USER,to:email,
        subject:"Salvatore doğrulama kodunuz",
        text:"Salvatore kayıt doğrulama kodunuz: "+code+"\nKod 10 dakika geçerlidir."
      });
      return res.json({ok:true,message:"Doğrulama kodu e-posta adresinize gönderildi."});
    }
    console.log("[SALVATORE DEV] "+email+" doğrulama kodu: "+code);
    res.json({ok:true,message:"Geliştirme modu: doğrulama kodu CMD ekranına yazıldı."});
  }catch(e){console.error(e);res.status(500).json({error:"E-posta gönderilemedi."});}
});

app.post("/api/register/finish",function(req,res){
  var email=cleanEmail(req.body.email),code=String(req.body.code||"").trim(),nickname=String(req.body.nickname||"").trim(),password=String(req.body.password||"");
  if(!email||!code||!validNick(nickname)||password.length<8)return res.status(400).json({error:"Bilgileri kontrol edin. Nickname 3-30 karakter, şifre en az 8 karakter olmalı."});
  var v=db.verification_codes.slice().reverse().find(function(x){return x.email===email&&x.code===code&&x.expires_at>Date.now();});
  if(!v)return res.status(400).json({error:"Kod hatalı veya süresi dolmuş."});
  if(findByEmail(email))return res.status(409).json({error:"Bu e-posta zaten kayıtlı."});
  if(findByNick(nickname))return res.status(409).json({error:"Bu nickname kullanılıyor."});
  var u={id:next("users"),email:email,nickname:nickname,password_hash:bcrypt.hashSync(password,12),is_admin:0,verified:1,created_at:new Date().toISOString()};
  db.users.push(u);
  db.channels.push({id:next("channels"),user_id:u.id,name:nickname,description:"",avatar:"",banner:"",subscribers:0});
  db.verification_codes=db.verification_codes.filter(function(x){return x.email!==email;});
  save(); req.session.userId=u.id; res.json({ok:true});
});

app.post("/api/login",function(req,res){
  var identifier=String(req.body.identifier||"").trim().toLowerCase(),password=String(req.body.password||"");
  var u=db.users.find(function(x){return x.email.toLowerCase()===identifier||x.nickname.toLowerCase()===identifier;});
  if(!u||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:"E-posta/nickname veya şifre hatalı."});
  req.session.userId=u.id;res.json({ok:true,isAdmin:!!u.is_admin});
});
app.post("/api/logout",function(req,res){req.session.destroy(function(){res.json({ok:true});});});

app.get("/api/videos",function(req,res){
  var rows=db.videos.filter(function(v){return v.visibility==="public";}).sort(function(a,b){return b.id-a.id;}).map(function(v){
    var u=findUser(v.user_id),c=channelFor(v.user_id);
    return Object.assign({},v,{nickname:u?u.nickname:"",channel_name:c?c.name:""});
  });
  res.json(rows);
});
app.get("/api/videos/:id",function(req,res){
  var v=db.videos.find(function(x){return x.id===Number(req.params.id);});
  if(!v)return res.status(404).json({error:"Video bulunamadı."});
  v.views++;save();
  var u=findUser(v.user_id),c=channelFor(v.user_id);
  res.json(Object.assign({},v,{nickname:u?u.nickname:"",channel_name:c?c.name:""}));
});

app.post("/api/videos",auth,upload.fields([{name:"video",maxCount:1},{name:"thumbnail",maxCount:1}]),function(req,res){
  if(!req.files||!req.files.video||!req.files.video[0])return res.status(400).json({error:"Video seçin."});
  var f=req.files.video[0],t=req.files.thumbnail&&req.files.thumbnail[0];
  var v={id:next("videos"),user_id:req.session.userId,title:req.body.title||"Yeni video",description:req.body.description||"",filename:f.filename,thumbnail:t?t.filename:"",views:0,likes:0,visibility:req.body.visibility||"public",created_at:new Date().toISOString()};
  db.videos.push(v);save();res.json({ok:true,id:v.id});
});

app.get("/api/channel/:nickname",function(req,res){
  var u=findByNick(req.params.nickname); if(!u)return res.status(404).json({error:"Kanal bulunamadı."});
  res.json({user:{id:u.id,nickname:u.nickname},channel:channelFor(u.id),videos:db.videos.filter(function(v){return v.user_id===u.id;}).sort(function(a,b){return b.id-a.id;})});
});

app.post("/api/channel/update",auth,upload.fields([{name:"avatar",maxCount:1},{name:"banner",maxCount:1}]),function(req,res){
  var c=channelFor(req.session.userId),a=req.files&&req.files.avatar&&req.files.avatar[0],b=req.files&&req.files.banner&&req.files.banner[0];
  c.name=req.body.name||c.name;c.description=req.body.description||"";
  if(a)c.avatar=a.filename;if(b)c.banner=b.filename;save();res.json({ok:true});
});

app.get("/api/admin/stats",admin,function(req,res){
  var views=db.videos.reduce(function(s,v){return s+Number(v.views||0);},0);
  res.json({users:db.users.length,videos:db.videos.length,views:views,comments:db.comments.length});
});
app.get("/api/admin/users",admin,function(req,res){
  res.json(db.users.slice().sort(function(a,b){return b.id-a.id;}).map(function(u){return {id:u.id,email:u.email,nickname:u.nickname,is_admin:u.is_admin,verified:u.verified,created_at:u.created_at};}));
});
app.get("/api/admin/videos",admin,function(req,res){
  res.json(db.videos.slice().sort(function(a,b){return b.id-a.id;}).map(function(v){var u=findUser(v.user_id);return {id:v.id,title:v.title,views:v.views,created_at:v.created_at,nickname:u?u.nickname:""};}));
});
app.delete("/api/admin/users/:id",admin,function(req,res){
  var id=Number(req.params.id);if(id===req.session.userId)return res.status(400).json({error:"Kendi hesabınızı silemezsiniz."});
  db.users=db.users.filter(function(u){return u.id!==id;});
  db.channels=db.channels.filter(function(c){return c.user_id!==id;});
  db.videos=db.videos.filter(function(v){return v.user_id!==id;});save();res.json({ok:true});
});
app.post("/api/admin/users/:id/reset-password",admin,function(req,res){
  var p=String(req.body.password||"");if(p.length<8)return res.status(400).json({error:"Şifre en az 8 karakter olmalı."});
  var u=findUser(req.params.id);if(!u)return res.status(404).json({error:"Üye bulunamadı."});
  u.password_hash=bcrypt.hashSync(p,12);save();res.json({ok:true});
});
app.delete("/api/admin/videos/:id",admin,function(req,res){
  var id=Number(req.params.id),v=db.videos.find(function(x){return x.id===id;});
  if(v){[v.filename,v.thumbnail].filter(Boolean).forEach(function(x){try{fs.unlinkSync(path.join(__dirname,"public","uploads",x));}catch(e){}});db.videos=db.videos.filter(function(x){return x.id!==id;});save();}
  res.json({ok:true});
});

app.get("/admin",function(req,res){res.sendFile(path.join(__dirname,"views","admin.html"));});
app.get("*",function(req,res){res.sendFile(path.join(__dirname,"public","index.html"));});
app.listen(PORT,function(){console.log("Salvatore çalışıyor: http://localhost:"+PORT);});

(function(global){
  'use strict';

  function decodeHtml(s){
    return String(s||'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"')
      .replace(/&#(\d+);/g,function(_,n){ return String.fromCharCode(parseInt(n,10)); })
      .replace(/&#x([0-9a-f]+);/gi,function(_,h){ return String.fromCharCode(parseInt(h,16)); });
  }

  function fixTextCorruption(s){
    if(typeof PropertyNameFix!=='undefined') return PropertyNameFix.fixTextCorruption(s);
    if(!s) return s;
    return String(s)
      .replace(/\uFFFD/g,'')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
      .replace(/グ[\uFFFD�]{1,3}ーン/g,'グリーン')
      .replace(/グーン/g,'グリーン')
      .replace(/��+/g,'');
  }

  function cleanPropertyName(name, info){
    name=fixTextCorruption(sanitizeText(name));
    if(!name) return name;
    var floor=name.match(/\s+(\d+)\s*階\s*$/);
    if(floor){
      name=name.replace(/\s+\d+\s*階\s*$/,'').trim();
      if(info&&(!info.kozo||info.kozo==='―')) info.kozo=floor[1]+'階';
    }
    name=name.replace(/\s+\d+(?:\.\d+)?\s*万円.*$/,'').trim();
    name=name.replace(/\s*[（(]\s*[\d.]+\s*万円.*$/,'').trim();
    if(typeof PropertyNameFix!=='undefined') return PropertyNameFix.canonicalizePropertyName(name);
    return name;
  }

  function sanitizeText(s){
    return fixTextCorruption(decodeHtml(String(s||''))
      .replace(/&nbsp;/gi,' ').replace(/<!--[\s\S]*?-->/g,'')
      .replace(/\[.*?\]/g,'').replace(/乗り換え案内/g,'')
      .replace(/\s+/g,' ').trim());
  }

  function isGarbageText(s){
    if(!s||s.length<2) return true;
    if(s.length>80) return true;
    return /郵便番号|ハイフンなし|例）|例\)|メールアドレス|電話番号|入力|確認メール|ログイン|SUUMO|資料請求|-->|<\/?|javascript:/i.test(s);
  }

  /** リスト分割で出る断片（・月)、（月額）の一部など）を除外 */
  function isListFragment(s){
    if(!s||s.length<3) return true;
    s=s.trim();
    if(/^[・、。．\s\(\)（）\[\]「」\\/]+$/.test(s)) return true;
    if(/^[・]?[月年日][）)]?$/.test(s)) return true;
    if(/^[（(][^（(]{0,6}[）)]$/.test(s)&&s.length<=8) return true;
    if(/^[\d\s・（）()月年日万円㎡m\-−:：,，]+$/.test(s)) return true;
    var core=s.replace(/[・、。．\s\(\)（）\[\]「」\/\\:：\-−\d年月日万円㎡m2]/g,'');
    return core.length<2;
  }

  function isValidAddress(s){
    s=sanitizeText(s);
    if(!s||s.length<5||s.length>60) return false;
    if(isGarbageText(s)) return false;
    return /(?:都|道|府|県).{1,30}(?:区|市|町|村|丁目|番|号)/.test(s) || /^(?:東京都|北海道|京都府|大阪府)/.test(s);
  }

  function normalizeUnits(s){
    if(!s) return s;
    return String(s)
      .replace(/m\s*2(?![0-9])/gi,'㎡')
      .replace(/m\^2/gi,'㎡')
      .replace(/(\d+)万円/g,function(_,n){ return parseInt(n,10).toLocaleString()+'万円'; });
  }

  function formatPriceDisplay(price){
    var n=parseInt(String(price||'').replace(/[^0-9]/g,''),10);
    if(!n) return price||'―';
    return n.toLocaleString()+'万円';
  }

  function formatChikuTag(chiku){
    var c=sanitizeText(chiku);
    if(!c||c==='―') return '―';
    if(/^築/.test(c)) return c;
    if(/\d{4}年/.test(c)) return '築'+c;
    return c;
  }

  function splitListText(text){
    if(!text||text==='―') return [];
    var parts=[], seen={};
    String(text).split(/[\n・\/／、]/).forEach(function(s){
      s=sanitizeText(s);
      if(s.length<2||s.length>48||isGarbageText(s)||isListFragment(s)||seen[s]) return;
      seen[s]=1;
      parts.push(s);
    });
    return parts;
  }

  function parseAccessLines(koutu){
    if(!koutu||koutu==='―') return [];
    var s=sanitizeText(koutu);
    var re=/[^、]+?(?:「[^」]+」|[^\s「」]+?駅)[^。]*?徒歩\d+分/g;
    var m=s.match(re);
    if(m&&m.length) return m.map(function(x){ return x.trim(); }).slice(0,5);
    return s.split(/[\n／\/]/).map(function(x){ return x.trim(); })
      .filter(function(x){ return x.length>4&&x.length<55&&!isGarbageText(x); }).slice(0,5);
  }

  function mapAddress(p){
    if(isValidAddress(p.address)) return sanitizeText(p.address);
    var n=p.name?sanitizeText(p.name):'';
    if(/グリーンパーク|日本橋/.test(n)) return '東京都中央区日本橋浜町';
    return '';
  }

  function sanitizePropInfo(p){
    if(!p) return p;
    p=JSON.parse(JSON.stringify(p));
    var strings=['name','address','price','madori','menseki','balcony','kozo','chiku','kanrihi','shuzenhk','parking','koutu','reno','setubi','area_desc'];
    strings.forEach(function(k){
      if(typeof p[k]==='string'){
        p[k]=normalizeUnits(sanitizeText(p[k]));
        if(p[k]==='-'||p[k]==='') p[k]='―';
      }
    });
    if(!isValidAddress(p.address)) p.address=mapAddress(p)||'';
    p.price=formatPriceDisplay(p.price);
    if(p.menseki) p.menseki=normalizeUnits(p.menseki);
    if(p.balcony) p.balcony=normalizeUnits(p.balcony);
    p.koutu=sanitizeText(p.koutu);
    var renoParts=splitListText(p.reno);
    var setubiParts=splitListText(p.setubi);
    if(renoParts.length) p.reno=renoParts.join('\n');
    else if(p.reno&&p.reno.length>50) p.reno='';
    else if(p.reno&&isListFragment(p.reno)) p.reno='―';
    if(setubiParts.length) p.setubi=setubiParts.join('\n');
    if(p.neighbors&&p.neighbors.length){
      p.neighbors=p.neighbors.map(function(n){
        return {cat:sanitizeText(n.cat), items:(n.items||[]).map(sanitizeText).filter(function(it){ return it&&!isGarbageText(it); }).slice(0,6)};
      }).filter(function(n){ return n.cat&&n.items.length; });
    }
    if(p.area_desc&&p.area_desc.length>500) p.area_desc=p.area_desc.substring(0,500);
    if(p.spots&&p.spots.length){
      p.spots=p.spots.map(function(s){ return {name:sanitizeText(s.name), desc:sanitizeText(s.desc)}; })
        .filter(function(s){ return s.name&&!isGarbageText(s.desc); });
    }
    if(p.name) p.name=cleanPropertyName(p.name, p);
    return p;
  }

  function pickPhotos(photoUrls, galleryPhotos){
    var labelMap={};
    (galleryPhotos||[]).forEach(function(ph,i){ if(ph.label) labelMap[i]=ph.label; });
    var photoList=photoUrls.slice(0,12);
    var mainPhoto='', gaikanPhoto='', otherPhotos=[];
    photoList.forEach(function(u,i){
      var lbl=labelMap[i]||'';
      if((lbl.indexOf('外観')>=0)&&!gaikanPhoto) gaikanPhoto=u;
      else if((lbl.indexOf('リビング')>=0||lbl.indexOf('LDK')>=0)&&!mainPhoto) mainPhoto=u;
      else otherPhotos.push({url:u,label:lbl||'写真'});
    });
    if(!mainPhoto) mainPhoto=photoList[0]||'';
    if(!gaikanPhoto) gaikanPhoto=photoList[1]||photoList[0]||'';
    if(!otherPhotos.length) otherPhotos=photoList.slice(0,8).map(function(u,i){ return {url:u,label:labelMap[i]||'写真'}; });

    var subPhoto2=null;
    var prefer=['眺望','キッチン','バルコニー','エントランス','洋室','浴室'];
    var pi, pj;
    for(pi=0;pi<otherPhotos.length;pi++){
      if(otherPhotos[pi].url===gaikanPhoto||otherPhotos[pi].url===mainPhoto) continue;
      for(pj=0;pj<prefer.length;pj++){
        if(otherPhotos[pi].label.indexOf(prefer[pj])>=0){ subPhoto2=otherPhotos[pi]; break; }
      }
      if(subPhoto2) break;
    }
    if(!subPhoto2){
      for(pi=0;pi<otherPhotos.length;pi++){
        if(otherPhotos[pi].url!==gaikanPhoto&&otherPhotos[pi].url!==mainPhoto){ subPhoto2=otherPhotos[pi]; break; }
      }
    }
    if(!subPhoto2) subPhoto2={url:gaikanPhoto,label:'外観'};

    return {mainPhoto:mainPhoto, gaikanPhoto:gaikanPhoto, subPhoto2:subPhoto2, otherPhotos:otherPhotos.slice(0,8)};
  }

  function trimAtBoundary(s, max){
    s=String(s||'').trim();
    if(!s||s.length<=max) return s;
    var cut=s.slice(0,max);
    var i=Math.max(cut.lastIndexOf('。'),cut.lastIndexOf('、'),cut.lastIndexOf('．'));
    if(i>=Math.floor(max*0.55)) return cut.slice(0,i+1);
    return cut;
  }

  function trimTitle(s, max){
    s=String(s||'').trim();
    if(!s||s.length<=max) return s;
    return s.slice(0,max);
  }

  function buildReasonCards(p, copy){
    var cards=[];
    var accessLines=parseAccessLines(p.koutu);
    if(accessLines.length){
      cards.push({badge:'A',label:'Access',title:'好アクセス',desc:trimAtBoundary(accessLines[0],80)});
    }
    var setubiLines=splitListText(p.setubi);
    if(setubiLines.length){
      cards.push({badge:'F',label:'Features',title:'充実の設備',desc:setubiLines[0]});
    }
    if(p.madori&&p.menseki){
      cards.push({badge:'L',label:'Layout',title:'理想の間取り',desc:trimAtBoundary(p.madori+' / '+p.menseki,80)});
    }
    if(p.chiku&&p.chiku!=='―'){
      cards.push({badge:'Q',label:'Quality',title:'安心の物件',desc:formatChikuTag(p.chiku)});
    }
    while(cards.length<3) cards.push({badge:'★',label:'Recommend',title:'おすすめ物件',desc:trimAtBoundary(p.name||'物件資料',80)});
    cards=cards.slice(0,3);
    if(copy&&copy.reason_hooks&&copy.reason_hooks.length){
      cards.forEach(function(c,i){
        var h=copy.reason_hooks[i];
        if(!h) return;
        if(h.title&&h.title.length>=2) c.title=trimTitle(h.title,15);
        if(h.desc&&h.desc.length>=8) c.desc=h.desc;
      });
    }
    return cards;
  }

  function buildEquipItems(p){
    var items=[], seen={};
    function add(list){
      (list||[]).forEach(function(s){
        s=sanitizeText(s);
        if(!s||seen[s]||isGarbageText(s)||isListFragment(s)||s.length>48) return;
        seen[s]=1;
        items.push(s);
      });
    }
    add(splitListText(p.reno));
    add(splitListText(p.setubi));
    if(!items.length) items=['詳細はお問い合わせください'];
    return items.slice(0,24);
  }

  function buildSections(p, photoUrls, madoriUrl, galleryPhotos, copy){
    copy=copy||{};
    var ph=pickPhotos(photoUrls, galleryPhotos);
    var reasons=buildReasonCards(p, copy);
    var accessLines=parseAccessLines(p.koutu);
    var equip=buildEquipItems(p);
    var madoriDesc=copy.madori_desc||'';
    if(!madoriDesc&&p.madori&&p.menseki) madoriDesc=p.madori+'・'+p.menseki+'の間取りで、効率的な動線とゆとりある空間を実現。日常の暮らしに寄り添う使いやすいレイアウトです。';

    var visual='<div id="visual-section" class="section-full fade-in"><div class="visual-wrap">'+
      '<div class="visual-main"><img src="'+escUrl(ph.mainPhoto)+'" alt="リビング" loading="lazy"></div>'+
      '<div class="visual-sub">'+
        '<div class="visual-sub-img"><img src="'+escUrl(ph.gaikanPhoto)+'" alt="外観" loading="lazy"><span class="visual-label">外観</span></div>'+
        '<div class="visual-sub-img"><img src="'+escUrl(ph.subPhoto2.url)+'" alt="'+esc(ph.subPhoto2.label)+'" loading="lazy"><span class="visual-label">'+esc(ph.subPhoto2.label)+'</span></div>'+
      '</div></div></div>';

    var reason='<div id="reason-section"><div class="section">'+
      '<div class="section-title">おすすめポイント</div>'+
      '<div class="reason-grid">'+reasons.map(function(c){
        return '<div class="reason-card"><div class="reason-title">'+esc(c.title)+'</div><div class="reason-desc">'+esc(c.desc)+'</div></div>';
      }).join('')+'</div></div></div>';

    var madori='<div id="madori-section" class="section fade-in">'+
      '<div class="section-title">間取り図</div>'+
      '<div class="madori-wrap"><div class="madori-img"><img src="'+escUrl(madoriUrl)+'" alt="間取り図" loading="lazy"></div>'+
      '<div class="madori-info"><div class="madori-spec">'+esc(p.madori||'―')+'　|　'+esc(p.menseki||'―')+'</div><div class="madori-desc">'+esc(madoriDesc)+'</div></div></div></div>';

    var slides=ph.otherPhotos.map(function(item){
      return '<div class="slider-slide"><img src="'+escUrl(item.url)+'" alt="'+esc(item.label)+'" loading="lazy">'+
        '<div class="slider-cap"><div class="slider-label">'+esc(item.label)+'</div></div></div>';
    }).join('');
    var gallery='<div id="gallery-section" class="section-full fade-in"><div class="inner">'+
      '<div class="section-title">物件写真</div>'+
      '<div class="slider-wrap"><div class="slider-track">'+slides+'</div>'+
      '<button class="slider-btn prev" type="button">←</button><button class="slider-btn next" type="button">→</button></div></div></div>';

    var accessIntro=copy.access_intro||'';
    if(!accessIntro) accessIntro=accessLines.length>1 ? '複数路線を利用でき、都心へのアクセスも良好な立地です。' : (accessLines.length===1 ? '駅近の好立地で、通勤・買い物にも便利です。' : '交通アクセスの詳細はお問い合わせください。');
    var accessList=accessLines.length ? accessLines.map(function(line){
      var parts=line.match(/^(.+?[「」\s\S]+?)(徒歩\d+分)/);
      if(parts) return '<li><span class="access-dot"></span><strong>'+esc(parts[1].trim())+'</strong><span class="access-walk">'+esc(parts[2])+'</span></li>';
      return '<li><span class="access-dot"></span>'+esc(line)+'</li>';
    }).join('') : '<li><span class="access-dot"></span>'+esc(p.koutu||'―')+'</li>';
    var mapAddr=mapAddress(p);
    var access='<div id="access-section" class="section fade-in">'+
      '<div class="section-title">交通アクセス</div>'+
      '<div class="access-intro">'+esc(accessIntro)+'</div><ul class="access-list">'+accessList+'</ul>'+
      (mapAddr?'<div class="map-container"><iframe src="https://maps.google.com/maps?q='+encodeURIComponent(mapAddr)+'&output=embed&z=16&hl=ja" loading="lazy"></iframe></div>':'')+
      '</div>';

    var specRows=[
      ['所在地', esc(p.address||'―')],['販売価格', esc(formatPriceDisplay(p.price))],
      ['間取り', esc(p.madori||'―')],['専有面積', esc(p.menseki||'―')],['バルコニー', esc(p.balcony||'―')],
      ['構造・階数', esc(p.kozo||'―')],['築年月', esc(p.chiku||'―')],['管理費', esc(p.kanrihi||'―')],
      ['修繕積立金', esc(p.shuzenhk||'―')],['駐車場', esc(p.parking||'―')]
    ];
    var spec='<div id="spec-section" class="section fade-in"><div class="section-title">物件概要</div>'+
      '<table class="spec-table"><tbody>'+specRows.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'; }).join('')+'</tbody></table></div>';

    var renoHero='';
    if(p.reno&&p.reno!=='―'){
      var renoText=copy.reno_intro||((p.name||'本物件')+'の魅力を最大限に活かした、快適な暮らしを叶える仕様です。');
      renoHero='<div class="reno-hero"><div class="reno-hero-text"><em>'+esc(p.name||'本物件')+'</em> — '+esc(renoText)+'</div></div>';
    }
    var reno='<div id="reno-section" class="section fade-in"><div class="section-title">リノベーション・設備仕様</div>'+
      renoHero+'<div class="equip-list">'+equip.map(function(s){ return '<div class="equip-item">'+esc(s)+'</div>'; }).join('')+'</div></div>';

    var areaBlocks=[];
    if(copy.area_blocks&&copy.area_blocks.length){
      areaBlocks=copy.area_blocks;
    } else {
      var areaText=(p.area_desc&&p.area_desc!=='―')?p.area_desc:'';
      if(areaText){
        areaBlocks=areaText.split(/\n\n|\n/).filter(function(t){ return t&&!isGarbageText(t); }).slice(0,2)
          .map(function(t,i){ return {title:i===0?'立地':'生活環境', text:t}; });
      }
      if(!areaBlocks.length && mapAddr){
        areaBlocks=[
          {title:'立地', text:mapAddr+'は生活利便性と住環境のバランスに優れたエリアです。'},
          {title:'生活環境', text:'周辺にはスーパー・コンビニ・交通機関が揃い、日常の暮らしを快適にサポートします。'}
        ];
      }
    }
    var area=areaBlocks.length?'<div id="area-section" class="section fade-in"><div class="section-title">エリア解説</div>'+
      areaBlocks.map(function(b){ return '<div class="area-block"><div class="area-block-title">'+esc(b.title||'エリア')+'</div><div class="area-text">'+esc(b.text)+'</div></div>'; }).join('')+'</div>':'';

    var neighbors=(p.neighbors&&p.neighbors.length)?p.neighbors:[];
    var facility=neighbors.length?'<div id="facility-section" class="section fade-in"><div class="section-title">周辺施設</div><div class="facility-grid">'+
      neighbors.slice(0,4).map(function(n){
        return '<div><div class="facility-cat">'+esc(n.cat||'')+'</div><ul class="facility-list">'+
          (n.items||[]).slice(0,5).map(function(it){ return '<li>'+esc(it)+'</li>'; }).join('')+'</ul></div>';
      }).join('')+'</div></div>':'';

    var spots=(copy.spots&&copy.spots.length)?copy.spots:((p.spots&&p.spots.length)?p.spots:[]);
    if(!spots.length && neighbors.length){
      spots=neighbors.slice(0,3).map(function(n){ return {name:n.cat, desc:(n.items&&n.items[0])||''}; });
    }
    var spot=spots.length?'<div id="spot-section" class="section fade-in"><div class="section-title">注目スポット</div>'+
      spots.slice(0,3).map(function(s){ return '<div class="spot-card"><div class="spot-name">'+esc(s.name||'')+'</div><div class="spot-desc">'+esc(s.desc||'')+'</div></div>'; }).join('')+'</div>':'';

    var cta='<div id="cta-section"><div class="section"><div class="cta-title">内見のご予約・お問い合わせ</div>'+
      '<div class="cta-sub">ご内見・ご質問など、お気軽にお問い合わせください。</div>'+
      '<a class="cta-btn" href="tel:0337897777"><span class="cta-btn-label">お電話でお問い合わせ</span><span class="cta-btn-tel">03-3789-7777</span><span class="cta-btn-sub">受付時間 10:00〜18:00</span></a>'+
      '<div class="cta-note">お気軽にお電話ください</div></div></div>';

    return visual+reason+madori+gallery+access+spec+reno+area+facility+spot+cta;
  }

  function buildLP(p, photoUrls, madoriUrl, sections){
    var price=parseInt((p.price||'0').replace(/[^0-9]/g,''))*10000;
    var rate=0.0093/12, n=600;
    var monthly=price>0?Math.round(price*rate/(1-Math.pow(1+rate,-n))):0;
    var kanri=parseInt((p.kanrihi||'0').replace(/[^0-9]/g,''));
    var shuz=parseInt((p.shuzenhk||'0').replace(/[^0-9]/g,''));
    var total=monthly+kanri+shuz;
    var totalPay=monthly*n;
    var interest=totalPay-price;
    var prinPct=totalPay>0?Math.round(price/totalPay*100):0;
    var intPct=totalPay>0?Math.round(interest/totalPay*100):0;
    var priceMan=Math.round(price/10000);
    var priceDisplay=priceMan>0?priceMan.toLocaleString():(p.price||'―');

    var heroPhoto=photoUrls&&photoUrls[0]?escUrl(photoUrls[0]):'';
    var heroBg=heroPhoto?' style="background-image:linear-gradient(135deg,rgba(22,34,33,0.92) 0%,rgba(28,43,42,0.72) 45%,rgba(36,54,53,0.55) 100%),url('+heroPhoto+')"':'';

    var hero='<div class="hero fade-in"'+heroBg+'>'+
      '<div class="hero-inner">'+
      '<div class="hero-company">東京マンション株式会社</div>'+
      '<div class="hero-name">'+esc(p.name||'')+'</div>'+
      '<div class="hero-room">'+esc(p.madori||'')+'<span class="hero-sep">|</span>'+esc(p.menseki||'')+'</div>'+
      '<div class="hero-price-wrap">'+
        '<div class="hero-price-label">販売価格（税込）</div>'+
        '<div class="hero-price"><span data-cu="'+priceMan+'" data-sf="万円">'+priceDisplay+'</span><span class="hero-price-suffix">万円</span></div>'+
      '</div>'+
      '</div></div>';

    var cost='<div id="cost-section" class="section fade-in">'+
      '<div class="section-title">費用シミュレーション</div>'+
      '<div class="cost-hero">'+
        '<div class="cost-hero-label">月額合計（目安）</div>'+
        '<div class="cost-hero-value"><span data-cu="'+total+'" data-sf="円">'+total.toLocaleString()+'円</span></div>'+
      '</div>'+
      '<div class="cost-grid">'+
        '<div class="cost-card"><div class="cost-card-label">住宅ローン返済</div><div class="cost-card-value"><span data-cu="'+monthly+'" data-sf="円">'+monthly.toLocaleString()+'円</span></div></div>'+
        '<div class="cost-card"><div class="cost-card-label">管理費＋修繕積立金</div><div class="cost-card-value"><span data-cu="'+(kanri+shuz)+'" data-sf="円">'+(kanri+shuz).toLocaleString()+'円</span></div></div>'+
      '</div>'+
      '<div class="chart-wrap">'+
        '<div class="chart-title">50年間の総支払額シミュレーション（金利0.93%・元利均等）</div>'+
        '<div class="bar-row"><div class="bar-label">元金</div><div class="bar-track"><div class="bar-fill" style="background:var(--dark)" data-w="'+prinPct+'"></div></div><div class="bar-val">'+priceMan.toLocaleString()+'万円</div></div>'+
        '<div class="bar-row"><div class="bar-label">利息</div><div class="bar-track"><div class="bar-fill" style="background:var(--green)" data-w="'+intPct+'"></div></div><div class="bar-val">'+Math.round(interest/10000).toLocaleString()+'万円</div></div>'+
      '</div>'+
      '<div class="cost-note">※フルローン・金利0.93%・50年・元利均等返済での試算です。実際の借入条件・金融機関によって異なります。</div>'+
    '</div>';

    var footer='<footer class="footer">'+
      '<div class="footer-company">東京マンション株式会社</div>'+
      '<div class="footer-note">本資料に記載の情報は参考ページ・公開情報に基づく概算であり、実際の内容は重要事項説明書にてご確認ください。管理費・修繕積立金等は変更となる場合がございます。</div>'+
    '</footer>';

    return hero+sections+cost+footer;
  }

  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function escUrl(u){return String(u||'').replace(/&amp;/g,'&').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

  function renderProperty(data){
    var p=data||{};
    var assets=p.assets||{};
    var photoUrls=assets.photoUrls||[];
    var galleryPhotos=assets.galleryPhotos||[];
    var madoriUrl=assets.madoriUrl||'';
    var info=sanitizePropInfo(JSON.parse(JSON.stringify(p.info||{})));
    var copy=p.copy||null;
    var sections=buildSections(info, photoUrls, madoriUrl, galleryPhotos, copy);
    return buildLP(info, photoUrls, madoriUrl, sections);
  }

  global.LPRender = {
    version: 2,
    renderProperty: renderProperty,
    cleanDisplayName: function(s){ return cleanPropertyName(s, {}) || fixTextCorruption(s) || s; }
  };
})(typeof window !== 'undefined' ? window : this);

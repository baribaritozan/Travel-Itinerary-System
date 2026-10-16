// Synthetic public payload only. Never copied into product code or Notion.
const at = time => `2026-10-09T${time}:00+09:00`;
export const phase5Fixture = {
  generatedAt: '2026-10-09T00:00:00Z',
  trip: { name:'秋の京都を歩く', slug:'sample-trip', timezone:'Asia/Tokyo', start:'2026-10-09', end:'2026-10-11' },
  places:[
    {id:'station',name:'京都駅',latitude:34.9858,longitude:135.7588,address:'検証用の駅住所'},
    {id:'temple',name:'清水寺',latitude:34.9949,longitude:135.785,website:'https://example.test/temple'},
    {id:'museum',name:'博物館',latitude:35.01,longitude:135.77},
  ],
  items:[
    {id:'p5-group',title:'午前の過ごし方',structure:'Alternative Group',start:at('09:00'),end:at('12:00')},
    {id:'p5-series',title:'東山さんぽ',structure:'Series',parentId:'p5-group',status:'Confirmed',start:at('09:00'),end:at('12:00')},
    {id:'p5-move',title:'京都駅 → 東山',type:'Transit',transport:'Bus',parentId:'p5-series',fromId:'station',toId:'temple',start:at('09:00'),end:at('09:30')},
    {id:'p5-visit',title:'清水寺を見学',type:'Sightseeing',parentId:'p5-series',placeId:'temple',start:at('09:30'),end:at('10:30'),durationMinutes:60,perPersonCost:500,currency:'JPY',notes:'歩きやすい靴で。\n集合場所・施設情報・住所を詳細に表示します。'},
    {id:'p5-free',title:'自由時間',structure:'Flexible Block',parentId:'p5-series',start:at('10:30'),end:at('12:00')},
    {id:'p5-street',title:'二年坂を散策',parentId:'p5-free',placeId:'temple',type:'Sightseeing',durationMinutes:30,perPersonCost:0,currency:'JPY'},
    {id:'p5-cafe',title:'カフェでひと休み',parentId:'p5-free',placeId:'temple',type:'Meal',durationMinutes:45,openingHours:'10:00–18:00'},
    {id:'p5-item',title:'博物館でゆっくり過ごす長い名前の屋内プラン',parentId:'p5-group',status:'Tentative',type:'Activity',placeId:'museum',start:at('09:00'),end:at('12:00'),notes:'長い公開メモ。'.repeat(40)},
    {id:'p5-choice-free',title:'駅周辺の自由時間',structure:'Flexible Block',parentId:'p5-group',status:'Candidate',start:at('09:00'),end:at('12:00')},
    {id:'p5-shop',title:'駅で買い物',parentId:'p5-choice-free',placeId:'station',type:'Activity',durationMinutes:20},
    {id:'p5-cancel',title:'中止した案',parentId:'p5-group',status:'Cancelled',start:at('09:00'),placeId:'station'},
    {id:'p5-lunch',title:'祇園でランチ',type:'Meal',placeId:'temple',start:at('12:30'),end:at('13:30'),reservationStatus:'Required'},
    {id:'p5-solo',title:'午後の散策',structure:'Series',start:at('14:00'),end:at('16:00')},
    {id:'p5-noend',title:'終了時刻なし',parentId:'p5-solo',placeId:'museum',start:at('14:00'),durationMinutes:30},
    {id:'p5-all',title:'終日のメモ',type:'Note',start:'2026-10-09'},
    {id:'p5-night',title:'夜をまたぐ移動',type:'Transit',transport:'Train',fromId:'temple',toId:'station',start:at('23:30'),end:'2026-10-10T01:00:00+09:00'},
    {id:'p5-detour',title:'任意の寄り道',detourForId:'p5-move',placeId:'station',durationMinutes:10,additionalDurationMinutes:90},
  ],
};

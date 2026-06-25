// 英文词库 · 按词。基础词重复多次提高可组句概率。
const basic = [
  // 代词、be 动词、助动词
  "I","you","he","she","it","we","they","me","him","her","us","them","myself",
  "my","your","his","her","its","our","their",
  "this","that","these","those","here","there",
  "a","an","the",
  "is","am","are","was","were","be","been","being",
  "have","has","had","having",
  "do","does","did","done",
  "not","will","would","can","could","should","may","might","must","shall",
  // 连词
  "and","but","or","so","because","if","when","where","how","what","who","why",
  "while","although","until",
  // 介词
  "in","on","at","to","for","from","with","about","into","of","by","up","out",
  "down","over","under","after","before","between",
  // 动词
  "go","come","eat","drink","see","hear","say","tell","think","know",
  "want","need","like","love","hate","feel",
  "make","take","give","get","put","let","ask","help","call","find",
  "leave","start","stop","try","use","work","play","live",
  "learn","study","read","write","speak","listen","watch","look",
  "buy","sell","keep","hold","bring","send","become",
  // 描述词
  "good","bad","big","small","new","old","high","low","fast","slow",
  "happy","sad","hot","cold","long","short","right","wrong",
  "great","nice","hard","easy","true","false",
  // 常用名词
  "time","day","night","week","year","today","morning","evening",
  "man","woman","child","people","friend","family",
  "home","school","work","place","world","country","city",
  "thing","way","life","name","book","food","water","money",
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "first","last","more","much","many","some","all","every","each","any","other",
  "very","really","just","still","already","always","never","often","only","also","too",
];

const advanced = basic.concat([
  "beautiful","important","interesting","different","difficult","possible","necessary",
  "usually","sometimes","again","back","through","around",
  "believe","remember","forget","understand","explain","decide","choose","change","continue",
  "follow","happen","travel","build","create","show","turn","move","pass",
  "teacher","student","morning","afternoon","weekend","summer","winter","spring",
  "problem","answer","question","reason","person",
  "quite","enough","another","next","during","without","inside","outside",
  "early","late","perfect","terrible","wonderful","sorry","ready","sure",
  "everything","nothing","someone","everyone",
]);

// 高频词多重复
const frequent = ["the","a","is","are","I","you","it","to","in","and","not","of","that","have","we","he","she"];
const basicWithDupes = basic.concat(frequent).concat(frequent);

export const charBank = {
  basic: basicWithDupes,
  advanced
};

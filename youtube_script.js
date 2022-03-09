// ==UserScript==
// @name        Youtube Scripts 
// @namespace   ytscrs
// @match       *://*.youtube.com/*
// @grant       none
// @version     1.0
// @author      -
// @description script to run on youtube
// @require  https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js
// ==/UserScript==

//required queryselectors
let elemMap = {
  "autoEl": ".ytp-right-controls > [title^=Auto]",
  "ytdapp": "ytd-app",
  "likesEl": "ytd-video-primary-info-renderer ytd-menu-renderer yt-formatted-string[aria-label]",
  "viewsEl": "ytd-video-view-count-renderer .view-count",
  "likeButton": "#ytd-toggle-button-renderer.style-text.force-icon-button.ytd-menu-renderer.style-scope:nth-of-type(1)"
};

let getElem = (key) => $(elemMap[key]);

// tries an "action" again and again until condition is met
function bruteForce(func, action) {
  return new Promise((resolve, reject) => {
    let tryCount = 0;
    let c = setInterval(()=>{
      tryCount ++;
      var ret;
      try {
        ret = func();
      } catch(e) {
        if(tryCount < 2) console.error(e);
        ret = undefined;
      }
      //console.debug(`tryCount: ${tryCount}, ret: ${ret}`);
      if(ret != undefined){
        clearInterval(c);
        console.log(action + ": successful in "+ tryCount + " attempts");
        resolve(ret);
      };
      if (tryCount >= 25) {
        clearInterval(c);
        console.error(action+":failed")
        reject();
      }
    }, 200);
  });
}

class ActionSeq {
  constructor(findKeys, shouldRetry, act, actName) {
    this.findKeys = findKeys;
    this.shouldRetry = shouldRetry;
    this.act = act;
    this.actName = actName;
  }
  
  findWrapper(key) {
    let ret = getElem(key);
    return ret.length ? ret: undefined;
  }
  
  actWrapper(els) {
    if(this.shouldRetry(els)) {
      this.act(els);
      if(this.shouldRetry(els)) {
        return undefined;
      }
    }
    return true;
  }
  
  retryAction(){
    if(this.elemsCache) 
      return bruteforce(() => this.actWrapper(this.elemsCache), this.actName);
    return this.execute()
  }
  
  execute(){
    return Promise.all(this.findKeys.map(key => bruteForce(() => this.findWrapper(key), "find "+key)))
    .then(els => {
      this.elemsCache = els;
      return bruteForce(() => this.actWrapper(els), this.actName)
    });
  }
  
}

//config
let actions = []
var enabled; //reused variable

//-----------------START: the tasks----

//=================Turn off Auto-play
enabled = true;
const isChecked = (elems) => elems[0].attr("title").split(" ")[2] == "on";
const turnOffAutoEl = (elems) => elems[0].click();
const autoPlayAction = new ActionSeq(["autoEl"], isChecked, turnOffAutoEl, "turn off autoEl");
if(enabled) actions.push(autoPlayAction);
//====================

//====================Likes to Views Ratio
enabled = true;
const ltvElems = ["ytdapp", "likesEl", "viewsEl"];
const ltvCheck = (elems) => !/^.*?\([0-9.]+%\)$/.test(elems[1].text());

function getVidRoot(ytdapp) {
    let con = ytdapp.data.response.contents.twoColumnWatchNextResults.results.results.contents;
    for(let i of con) {
        if(i.videoPrimaryInfoRenderer) {
            return i;
        }
    }
    return undefined;
}

function getViews(vidroot, vwEl) {
  let text = "";
  try {
    text =  vidroot.viewCount.videoViewCountRenderer.viewCount.simpleText;
  } catch {
    text = vwEl.text();
  }
  return parseInt(text.replaceAll(/[^0-9]+/g, ""));
}

function getLikes(vidroot) {
  const likeBtn = vidroot.videoPrimaryInfoRenderer.videoActions.menuRenderer.topLevelButtons[0].toggleButtonRenderer;
  const likes = parseInt(likeBtn.defaultText.accessibility.accessibilityData.label.replaceAll(/[^0-9]+/g, ""));
  const likeText = likeBtn.defaultText.simpleText;
  return [likes, likeText];
}

function showRatio(elems) {
  const vidroot = getVidRoot(elems[0][0]);
  const [likes, likeText] = getLikes(vidroot);
  const views = getViews(vidroot, elems[2]);
  const ratio = (Math.round((likes/views)*100*100)/100).toFixed(2);
  const finalText = `${likeText} (${ratio}%)`;
  console.log("ratio:", ratio);
  elems[1].text(finalText);
}

const ratioAction = new ActionSeq(ltvElems, ltvCheck, showRatio, "Show ratio");
if(enabled) actions.push(ratioAction);
//=====================


//-----------------END: the tasks----

//it works. for now
const handleChange = (acts) => Promise.allSettled(acts.map(act => act.execute()));
const handleRetry = (acts) => Promise.allSettled(acts.map(act => act.retryAction()));
const handleChangeRetry = () => handleChange(actions).then(values => {
  const actions1 = values.map((val, i) => val.status == "rejected"? actions[i]: undefined).filter((v)=>v);
  setTimeout(()=>handleChange(actions1), 1000);
});

let oldHref = document.location.href;
function startObserving(callback) {
  const bodyList = document.querySelector("body")
  const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
          if (oldHref != document.location.href) {
              oldHref = document.location.href;
              callback();
          }
      });
  });

  const config = {
      childList: true,
      subtree: true
  };

  observer.observe(bodyList, config);
}


(function(){
  handleChangeRetry();
  startObserving(handleChangeRetry)
})();

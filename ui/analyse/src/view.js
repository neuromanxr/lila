var m = require('mithril');
var chessground = require('chessground');
var classSet = require('common').classSet;
var bindOnce = require('common').bindOnce;
var synthetic = require('./util').synthetic;
var game = require('game').game;
var renderStatus = require('game').view.status;
var router = require('game').router;
var treePath = require('tree').path;
var treeView = require('./treeView');
var control = require('./control');
var actionMenu = require('./actionMenu').view;
var renderPromotion = require('./promotion').view;
var pgnExport = require('./pgnExport');
var forecastView = require('./forecast/forecastView');
var cevalView = require('ceval').view;
var crazyView = require('./crazy/crazyView');
var keyboardView = require('./keyboard').view;
var explorerView = require('./explorer/explorerView');
var retroView = require('./retrospect/retroView');
var practiceView = require('./practice/practiceView');
var studyView = require('./study/studyView');
var forkView = require('./fork').view;
var acplView = require('./acpl').render;

function renderResult(ctrl) {
  var result;
  if (ctrl.data.game.status.id >= 30) switch (ctrl.data.game.winner) {
    case 'white':
      result = '1-0';
      break;
    case 'black':
      result = '0-1';
      break;
    default:
      result = '½-½';
  }
  if (result) {
    var tags = [];
    tags.push(m('div.result', result));
    var winner = game.getPlayer(ctrl.data, ctrl.data.game.winner);
    tags.push(m('div.status', [
      renderStatus(ctrl),
      winner ? ', ' + ctrl.trans(winner.color == 'white' ? 'whiteIsVictorious' : 'blackIsVictorious') : null
    ]));
    return tags;
  }
}

function makeConcealOf(ctrl) {
  var conceal = (ctrl.study && ctrl.study.data.chapter.conceal !== null) ? {
    owner: ctrl.study.isChapterOwner(),
    ply: ctrl.study.data.chapter.conceal
  } : null;
  if (conceal) return function(isMainline) {
    return function(path, node) {
      if (!conceal || (isMainline && conceal.ply >= node.ply)) return null;
      if (treePath.contains(ctrl.vm.path, path)) return null;
      return conceal.owner ? 'conceal' : 'hide';
    };
  };
}

function renderAnalyse(ctrl, concealOf) {
  return m('div.areplay', [
    renderChapterName(ctrl),
    renderOpeningBox(ctrl),
    treeView.render(ctrl, concealOf),
    renderResult(ctrl)
  ]);
}

function wheel(ctrl, e) {
  if (e.target.tagName !== 'PIECE' && e.target.tagName !== 'SQUARE' && !e.target.classList.contains('cg-board')) return;
  if (e.deltaY > 0) control.next(ctrl);
  else if (e.deltaY < 0) control.prev(ctrl);
  m.redraw();
  e.preventDefault();
  return false;
}

function inputs(ctrl) {
  if (ctrl.ongoing || !ctrl.data.userAnalysis) return null;
  if (ctrl.vm.redirecting) return m.trust(lichess.spinnerHtml);
  var pgnText = pgnExport.renderFullTxt(ctrl);
  return m('div.copyables', [
    m('label.name', 'FEN'),
    m('input.copyable.autoselect[spellCheck=false]', {
      value: ctrl.vm.node.fen,
      config: bindOnce('change', function(e) {
        if (e.target.value !== ctrl.vm.node.fen) ctrl.changeFen(e.target.value);
      })
    }),
    m('div.pgn', [
      m('label.name', 'PGN'),
      m('textarea.copyable.autoselect[spellCheck=false]', {
        value: pgnText
      }),
      m('div.action', [
        m('button', {
          class: 'button text',
          'data-icon': 'G',
          config: bindOnce('click', function(e) {
            var pgn = $('.copyables .pgn textarea').val();
            if (pgn !== pgnText) ctrl.changePgn(pgn);
          })
        }, 'Import PGN')
      ])
    ])
  ]);
}

function visualBoard(ctrl) {
  return m('div.lichess_board_wrap', [
    ctrl.vm.keyboardHelp ? keyboardView(ctrl) : null,
    ctrl.study ? studyView.overboard(ctrl.study) : null,
    m('div', {
      class: 'lichess_board ' + ctrl.data.game.variant.key + ((ctrl.study && ctrl.data.pref.blindfold) ? ' blindfold' : ''),
      config: function(el, isUpdate) {
        if (!isUpdate) el.addEventListener('wheel', function(e) {
          return wheel(ctrl, e);
        });
      }
    }, [
      chessground.view(ctrl.chessground),
      renderPromotion(ctrl)
    ]),
    cevalView.renderGauge(ctrl)
  ]);
}

function blindBoard(ctrl) {
  return m('div.lichess_board_blind', [
    m('div.textual', {
      config: function(el, isUpdate) {
        if (isUpdate) return;
        var url = ctrl.data.player.spectator ?
          router.game(ctrl.data, ctrl.data.player.color) :
          router.player(ctrl.data);
        url += '/text';
        $(el).load(url);
      }
    }),
    chessground.view(ctrl.chessground)
  ]);
}

function jumpButton(icon, effect, enabled) {
  return {
    tag: 'button',
    attrs: {
      'data-act': effect,
      'data-icon': icon,
      disabled: !enabled
    }
  };
}

function icon(c) {
  return {
    tag: 'i',
    attrs: {
      'data-icon': c
    }
  };
}

function dataAct(e) {
  return e.target.getAttribute('data-act') ||
    e.target.parentNode.getAttribute('data-act');
}

function buttons(ctrl) {
  var canJumpPrev = ctrl.vm.path !== '';
  var canJumpNext = !!ctrl.vm.node.children[0];
  var isStudyPractice = ctrl.study && ctrl.study.practice;
  return m('div.game_control', {
    config: bindOnce('mousedown', function(e) {
      var action = dataAct(e);
      if (action === 'prev') control.prev(ctrl);
      else if (action === 'next') control.next(ctrl);
      else if (action === 'first') control.first(ctrl);
      else if (action === 'last') control.last(ctrl);
      else if (action === 'explorer') ctrl.toggleExplorer();
      else if (action === 'practice') ctrl.togglePractice();
      else if (action === 'menu') ctrl.actionMenu.toggle();
    })
  }, [
    (isStudyPractice || ctrl.embed) ? null : m('div.features', [
      m('button', {
        'data-hint': ctrl.trans('openingExplorer'),
        'data-act': 'explorer',
        class: 'hint--bottom' + (
          ctrl.actionMenu.open || !ctrl.explorer.allowed() || ctrl.retro ? ' hidden' : (
            ctrl.explorer.enabled() ? ' active' : ''))
      }, icon(']')),
      ctrl.ceval.possible ? m('button', {
        'data-hint': 'Practice with computer',
        'data-act': 'practice',
        class: 'hint--bottom' + (
          ctrl.actionMenu.open || ctrl.retro ? ' hidden' : (
            ctrl.practice ? ' active' : ''))
      }, icon('')) : null
    ]),
    m('div.jumps', [
      jumpButton('W', 'first', canJumpPrev),
      jumpButton('Y', 'prev', canJumpPrev),
      jumpButton('X', 'next', canJumpNext),
      jumpButton('V', 'last', canJumpNext)
    ]),
    isStudyPractice ? null : m('button', {
      class: 'hint--bottom' + (ctrl.actionMenu.open ? ' active' : ''),
      'data-hint': 'Menu',
      'data-act': 'menu'
    }, icon('['))
  ]);
}

function renderOpeningBox(ctrl) {
  var opening = ctrl.tree.getOpening(ctrl.vm.nodeList);
  if (!opening && !ctrl.vm.path) opening = ctrl.data.game.opening;
  if (opening) return m('div', {
    class: 'opening_box',
    title: opening.eco + ' ' + opening.name
  }, [
    m('strong', opening.eco),
    ' ' + opening.name
  ]);
}

function renderChapterName(ctrl) {
  if (ctrl.embed && ctrl.study) return m('div', {
    class: 'chapter_name'
  }, ctrl.study.currentChapter().name);
}

var firstRender = true;

module.exports = function(ctrl) {
  var concealOf = makeConcealOf(ctrl);
  var showCevalPvs = !(ctrl.retro && ctrl.retro.isSolving()) && !ctrl.practice;
  return [
    m('div', {
      config: function(el, isUpdate) {
        if (firstRender) firstRender = false;
        else if (!isUpdate) lichess.pubsub.emit('reset_zoom')();
      },
      class: classSet({
        'gauge_displayed': ctrl.showEvalGauge(),
        'no_computer': !ctrl.vm.showComputer()
      })
    }, [
      m('div.lichess_game', {
        config: function(el, isUpdate) {
          if (isUpdate) return;
          lichess.pubsub.emit('content_loaded')();
        }
      }, [
        ctrl.data.blind ? blindBoard(ctrl) : visualBoard(ctrl),
        m('div.lichess_ground', [
          ctrl.actionMenu.open ? null : crazyView.pocket(ctrl, ctrl.topColor(), 'top'),
          ctrl.actionMenu.open ? actionMenu(ctrl) : [
            cevalView.renderCeval(ctrl),
            showCevalPvs ? cevalView.renderPvs(ctrl) : null,
            renderAnalyse(ctrl, concealOf),
            forkView(ctrl, concealOf),
            retroView(ctrl) || practiceView(ctrl) || explorerView(ctrl)
          ],
          ctrl.actionMenu.open ? null : crazyView.pocket(ctrl, ctrl.bottomColor(), 'bottom'),
          buttons(ctrl)
        ])
      ])
    ]),
    ctrl.embed ? null : m('div', {
      class: 'underboard' + (ctrl.vm.showComputer() ? '' : ' no_computer')
    }, [
      m('div.center', ctrl.study ? studyView.underboard(ctrl) : inputs(ctrl)),
      m('div.right', acplView(ctrl))
    ]),
    ctrl.embed || synthetic(ctrl.data) ? null : m('div.analeft', [
      ctrl.forecast ? forecastView(ctrl) : null,
      game.playable(ctrl.data) ? m('div.back_to_game',
        m('a', {
          class: 'button text',
          href: ctrl.data.player.id ? router.player(ctrl.data) : router.game(ctrl.data),
          'data-icon': 'i'
        }, ctrl.trans('backToGame'))
      ) : null
    ])
  ];
};

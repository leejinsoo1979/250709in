# tttcraft for SketchUp - Main Module
#
# 메뉴/툴바 등록, HtmlDialog로 tttcraft 에디터 띄우기, DAE 임포트 콜백 처리.

require 'sketchup.rb'
require_relative 'importer'
require_relative 'oauth_bridge'

module TTTCraft
  EDITOR_URL = 'https://tttcraft.com/sketchup?sketchup=1'.freeze
  DIALOG_PREF_KEY = 'com.tttcraft.editor'.freeze

  @dialog = nil

  # tttcraft 에디터 다이얼로그를 표시한다.
  # 이미 떠 있으면 앞으로 가져온다.
  def self.show_editor
    if @dialog && @dialog.visible?
      @dialog.bring_to_front
      return
    end

    @dialog = UI::HtmlDialog.new(
      dialog_title:    'tttcraft',
      preferences_key: DIALOG_PREF_KEY,
      scrollable:      true,
      resizable:       true,
      width:           1400,
      height:          900,
      min_width:       1024,
      min_height:      720,
      style:           UI::HtmlDialog::STYLE_DIALOG
    )

    @dialog.set_url(EDITOR_URL)

    # JS → Ruby: DAE base64 데이터를 받아 SketchUp에 import
    @dialog.add_action_callback('import_dae') do |_action_context, base64_data, filename|
      Importer.import_from_base64(base64_data, filename, @dialog)
    end

    # JS → Ruby: 외부 브라우저로 OAuth 위임 시작
    @dialog.add_action_callback('open_external_oauth') do |_action_context, state|
      port = OAuthBridge.start(@dialog, state)
      if port.nil?
        @dialog.execute_script("window.__sketchupOAuthError && window.__sketchupOAuthError('failed_to_start_local_server');")
      end
    end

    # JS → Ruby: 환경 핑 (디버그용)
    @dialog.add_action_callback('sketchup_ready') do |_action_context|
      puts '[tttcraft] sketchup_ready ping received'
    end

    @dialog.show
  end

  # 메뉴/툴바 등록은 SketchUp 시작 시 1회만 실행
  unless file_loaded?(__FILE__)
    # ① Extensions 메뉴
    menu = UI.menu('Extensions').add_submenu('tttcraft')
    menu.add_item('디자인 시작 / Open Editor') { show_editor }
    menu.add_separator
    menu.add_item('정보 / About') do
      UI.messagebox(
        "tttcraft for SketchUp\nv#{PLUGIN_VERSION}\n\nhttps://tttcraft.com",
        MB_OK
      )
    end

    # ② 툴바
    toolbar = UI::Toolbar.new('tttcraft')

    cmd = UI::Command.new('tttcraft') { show_editor }
    cmd.tooltip         = 'tttcraft 에디터 열기'
    cmd.status_bar_text = 'tttcraft에서 디자인한 가구를 SketchUp으로 바로 가져옵니다'

    icon_dir = File.join(PLUGIN_ROOT, 'tttcraft', 'icons')
    small_icon = File.join(icon_dir, 'logo_24.png')
    large_icon = File.join(icon_dir, 'logo_32.png')
    cmd.small_icon = small_icon if File.exist?(small_icon)
    cmd.large_icon = large_icon if File.exist?(large_icon)

    toolbar.add_item(cmd)
    toolbar.show

    file_loaded(__FILE__)
  end
end

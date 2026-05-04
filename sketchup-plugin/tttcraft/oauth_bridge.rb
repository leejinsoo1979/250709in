# tttcraft for SketchUp - OAuth Bridge
#
# HtmlDialog 안의 CEF는 자동완성 / 시스템 쿠키 / 한글 UI 등이 제한적이라
# 구글 OAuth는 시스템 기본 브라우저로 위임한다.
#
# 흐름:
#   1) JS가 open_external_oauth(state) 호출
#   2) 루비가 임의 포트로 WEBrick HTTP 서버 시작 (loopback only)
#   3) UI.openURL("https://tttcraft.com/sketchup-oauth?port=...&state=...")
#   4) 시스템 브라우저에서 OAuth 진행 후 토큰 획득
#   5) 브라우저 → fetch("http://127.0.0.1:포트/oauth-callback", { token, state })
#   6) 루비가 dialog.execute_script("window.__sketchupOAuthToken(token)") 로 토큰 주입
#   7) HtmlDialog 안의 JS가 signInWithCredential 호출하여 Firebase 로그인 완결

require 'webrick'
require 'json'
require 'securerandom'

module TTTCraft
  module OAuthBridge
    @server = nil
    @server_thread = nil
    @port = nil
    @expected_state = nil
    @dialog = nil

    LOOPBACK_HOST = '127.0.0.1'.freeze
    PORT_RANGE = (39200..39299).freeze   # 임의의 사용자 영역 포트

    # JS에서 호출되는 진입점.
    # state는 CSRF 방지 + 콜백 검증용 1회용 토큰 (JS측이 생성).
    def self.start(dialog, state)
      stop  # 기존에 떠있으면 정리

      @dialog = dialog
      @expected_state = state.to_s

      port = pick_free_port
      @port = port

      @server = WEBrick::HTTPServer.new(
        Port: port,
        BindAddress: LOOPBACK_HOST,
        AccessLog: [],
        Logger: WEBrick::Log.new(File::NULL),
        DoNotReverseLookup: true
      )

      @server.mount_proc('/oauth-callback') do |req, res|
        handle_callback(req, res)
      end

      # CORS 프리플라이트 / 단순 ping
      @server.mount_proc('/ping') do |_req, res|
        res.status = 200
        res['Access-Control-Allow-Origin'] = '*'
        res.body = 'pong'
      end

      @server_thread = Thread.new { @server.start }

      # 외부 브라우저로 OAuth 페이지 열기
      url = "https://tttcraft.com/sketchup-oauth?port=#{port}&state=#{URI.encode_www_form_component(state)}"
      UI.openURL(url)

      port
    rescue StandardError => e
      warn "[tttcraft] OAuth bridge start failed: #{e.class}: #{e.message}"
      stop
      nil
    end

    def self.stop
      begin
        @server&.shutdown
      rescue StandardError
        # ignore
      end
      begin
        @server_thread&.kill
      rescue StandardError
        # ignore
      end
      @server = nil
      @server_thread = nil
      @port = nil
      @expected_state = nil
    end

    # 콜백 처리
    def self.handle_callback(req, res)
      # CORS 응답 (브라우저에서 fetch로 호출되므로)
      res['Access-Control-Allow-Origin'] = '*'
      res['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
      res['Access-Control-Allow-Headers'] = 'Content-Type'

      if req.request_method == 'OPTIONS'
        res.status = 204
        return
      end

      payload = parse_payload(req)
      token = payload['token'].to_s
      state = payload['state'].to_s

      if @expected_state.nil? || @expected_state.empty? || state != @expected_state
        res.status = 400
        res.body = '{"ok":false,"error":"state_mismatch"}'
        return
      end

      if token.empty?
        res.status = 400
        res.body = '{"ok":false,"error":"empty_token"}'
        return
      end

      # 다이얼로그가 떠 있을 때만 토큰 주입
      if @dialog && @dialog.respond_to?(:execute_script)
        # JSON 직렬화로 안전하게 escape
        safe_token = JSON.dump(token)
        js = "window.__sketchupOAuthToken && window.__sketchupOAuthToken(#{safe_token});"
        @dialog.execute_script(js)
      end

      res.status = 200
      res['Content-Type'] = 'application/json'
      res.body = '{"ok":true}'

      # 콜백 한 번 받으면 즉시 서버 정리 (재사용 방지)
      Thread.new do
        sleep 0.5
        stop
      end
    rescue StandardError => e
      warn "[tttcraft] callback error: #{e.class}: #{e.message}"
      res.status = 500
      res.body = '{"ok":false,"error":"internal"}'
    end

    def self.parse_payload(req)
      body = req.body.to_s
      return {} if body.empty?

      content_type = (req['Content-Type'] || '').downcase
      if content_type.include?('application/json')
        JSON.parse(body) rescue {}
      else
        # urlencoded
        URI.decode_www_form(body).to_h rescue {}
      end
    end

    def self.pick_free_port
      PORT_RANGE.each do |p|
        begin
          s = TCPServer.new(LOOPBACK_HOST, p)
          s.close
          return p
        rescue Errno::EADDRINUSE
          next
        end
      end
      raise 'No free port in OAuth bridge range'
    end
  end
end

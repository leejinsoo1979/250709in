# tttcraft for SketchUp - DAE Importer
#
# JS에서 받은 base64 DAE 데이터를 임시 파일로 저장 후 active model에 import한다.

require 'base64'
require 'fileutils'
require 'tmpdir'
require 'json'

module TTTCraft
  module Importer
    TMP_SUBDIR = 'tttcraft_sketchup'.freeze

    # base64로 인코딩된 DAE 데이터를 받아 SketchUp에 import.
    #
    # @param base64_data [String] base64 인코딩된 DAE XML
    # @param filename    [String] 권장 파일명 (확장자 .dae)
    # @param dialog      [UI::HtmlDialog, nil] 결과를 JS로 알리기 위한 다이얼로그 핸들
    def self.import_from_base64(base64_data, filename, dialog = nil)
      tmp_path = nil
      success = false

      begin
        safe_name = sanitize_filename(filename)
        tmp_dir = File.join(Dir.tmpdir, TMP_SUBDIR)
        FileUtils.mkdir_p(tmp_dir)
        tmp_path = File.join(tmp_dir, safe_name)

        File.binwrite(tmp_path, Base64.decode64(base64_data.to_s))

        model = Sketchup.active_model
        if model.nil?
          notify(dialog, false, 'No active SketchUp model')
          return
        end

        operation_name = 'Import from tttcraft'
        model.start_operation(operation_name, true)

        # SketchUp 2014+ 시그니처: model.import(path, options_hash)
        import_options = {
          'show_summary' => false,
          'merge_coplanar_faces' => false
        }

        success = begin
          model.import(tmp_path, import_options)
        rescue ArgumentError
          # 구버전 폴백
          model.import(tmp_path, false)
        end

        if success
          model.commit_operation
          UI.messagebox('tttcraft 디자인을 가져왔습니다!', MB_OK)
        else
          model.abort_operation
          UI.messagebox('SketchUp으로 가져오기에 실패했습니다.', MB_OK)
        end

        notify(dialog, success)
      rescue StandardError => e
        warn "[tttcraft] import error: #{e.class}: #{e.message}"
        warn e.backtrace.first(5).join("\n") if e.backtrace
        notify(dialog, false, e.message)
      ensure
        if tmp_path && File.exist?(tmp_path)
          begin
            File.delete(tmp_path)
          rescue StandardError
            # 삭제 실패는 무시
          end
        end
      end
    end

    # JS 콜백으로 import 결과를 통지.
    def self.notify(dialog, success, error_message = nil)
      return unless dialog && dialog.respond_to?(:execute_script)

      payload = {
        success: success ? true : false,
        error: error_message
      }
      js_payload = payload.to_json rescue '{"success":false}'
      dialog.execute_script("window.__sketchupImportDone && window.__sketchupImportDone(#{js_payload});")
    rescue StandardError => e
      warn "[tttcraft] notify error: #{e.message}"
    end

    # 임시 파일명을 안전하게 정리.
    def self.sanitize_filename(name)
      base = (name && !name.empty?) ? name : "tttcraft_#{Time.now.to_i}.dae"
      base = base.gsub(/[^A-Za-z0-9_\-\.]/, '_')
      base = "#{base}.dae" unless base.downcase.end_with?('.dae')
      base
    end
  end
end

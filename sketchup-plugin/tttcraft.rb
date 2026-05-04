# tttcraft for SketchUp - Extension Loader
#
# 이 파일은 SketchUp이 플러그인을 인식하기 위한 진입점이다.
# 실제 로직은 tttcraft/main.rb에 있다.

require 'sketchup.rb'
require 'extensions.rb'

module TTTCraft
  PLUGIN_ROOT = File.dirname(__FILE__)
  PLUGIN_VERSION = '1.0.0'.freeze

  unless defined?(@extension_loaded) && @extension_loaded
    extension = SketchupExtension.new(
      'tttcraft',
      File.join(PLUGIN_ROOT, 'tttcraft', 'main.rb')
    )
    extension.version     = PLUGIN_VERSION
    extension.creator     = 'tttcraft'
    extension.copyright   = "© #{Time.now.year} tttcraft"
    extension.description = 'tttcraft 에디터에서 디자인한 가구를 SketchUp으로 바로 가져옵니다.'

    Sketchup.register_extension(extension, true)
    @extension_loaded = true
  end
end

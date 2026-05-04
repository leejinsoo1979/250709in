# tttcraft for SketchUp - Panel Importer
#
# 웹앱에서 받은 패널 그룹 JSON을 직접 SketchUp 모델에 그룹/태그로 생성한다.
# DAE 임포트의 한계(노드 트리/이름/layer 정보 손실)를 우회.
#
# JSON 페이로드 구조:
# {
#   "designName": "...",
#   "groups": [
#     {
#       "name": "좌측판",
#       "meshes": [
#         {
#           "vertices": [x1,y1,z1, x2,y2,z2, ...],   # mm 단위, Z-up
#           "indices":  [i1,i2,i3, i4,i5,i6, ...],   # 삼각형
#           "color":    {"r":200,"g":200,"b":200},   # 0~255
#           "opacity":  1.0
#         }
#       ]
#     }
#   ],
#   "unnamed": [ ...mesh... ]
# }

require 'json'

module TTTCraft
  module PanelImporter
    # SketchUp 내부 단위는 inch. 1 inch = 25.4 mm.
    MM_TO_INCH = 1.0 / 25.4

    # 메인 진입점.
    # @param json_string [String] sceneToPanelJSON 결과 JSON 문자열
    # @param dialog      [UI::HtmlDialog, nil] 결과 통지용 다이얼로그
    def self.import_from_json(json_string, dialog = nil)
      payload = JSON.parse(json_string)

      model = Sketchup.active_model
      if model.nil?
        notify(dialog, false, 'No active SketchUp model')
        return
      end

      operation_name = "Import from tttcraft (#{payload['designName'] || 'design'})"
      model.start_operation(operation_name, true)

      total_meshes = 0
      total_groups = 0
      success = false

      begin
        # 명명된 패널 그룹 처리
        groups = payload['groups'] || []
        groups.each do |group_data|
          name = group_data['name'].to_s
          meshes = group_data['meshes'] || []
          next if meshes.empty?

          # 1) 같은 이름의 SketchUp 태그(Layer) 가져오거나 생성
          layer = ensure_layer(model, name)

          # 2) SketchUp 그룹 생성 (모델 최상위)
          group = model.entities.add_group
          group.name = name
          group.layer = layer

          # 3) 각 메시 면을 그룹 내부에 추가
          meshes.each do |mesh_data|
            count = add_mesh_to_entities(group.entities, mesh_data)
            total_meshes += count
          end

          total_groups += 1
        end

        # 이름 없는 메시들도 추가 (기타 그룹)
        unnamed = payload['unnamed'] || []
        unless unnamed.empty?
          group = model.entities.add_group
          group.name = '기타'
          unnamed.each do |mesh_data|
            count = add_mesh_to_entities(group.entities, mesh_data)
            total_meshes += count
          end
          total_groups += 1
        end

        success = total_groups > 0

        if success
          model.commit_operation
          puts "[tttcraft] 임포트 완료: 그룹=#{total_groups}, 면=#{total_meshes}"
          UI.messagebox("tttcraft 디자인을 가져왔습니다!\n그룹 #{total_groups}개, 면 #{total_meshes}개")
        else
          model.abort_operation
          UI.messagebox('가져올 데이터가 비어있습니다.')
        end

        notify(dialog, success)
      rescue StandardError => e
        warn "[tttcraft] panel import error: #{e.class}: #{e.message}"
        warn e.backtrace.first(8).join("\n") if e.backtrace
        model.abort_operation rescue nil
        notify(dialog, false, e.message)
      end
    end

    # SketchUp 태그(레이어)를 가져오거나 생성.
    def self.ensure_layer(model, name)
      return nil if name.nil? || name.empty?
      layer = model.layers[name]
      layer ||= model.layers.add(name)
      layer
    end

    # 메시 데이터에서 박스(축 정렬 직육면체)를 추출하여 깔끔한 6개 사각형 면으로 추가.
    # 입력 메시는 임의의 정점/삼각형 모음이지만, 가구 패널은 모두 축 정렬 박스이므로
    # 정점들의 min/max만 구하면 박스 8개 꼭짓점이 나온다.
    # 결과: 박스마다 6개 사각형 면 (삼각형 분할 없음, 평범한 4각형)
    # @return [Integer] 생성된 face 개수
    def self.add_mesh_to_entities(entities, mesh_data)
      vertices_flat = mesh_data['vertices']
      return 0 unless vertices_flat && vertices_flat.length >= 9

      color = mesh_data['color'] || {}
      opacity = (mesh_data['opacity'] || 1.0).to_f

      # 정점들의 min/max (mm 단위)
      min_x = Float::INFINITY; min_y = Float::INFINITY; min_z = Float::INFINITY
      max_x = -Float::INFINITY; max_y = -Float::INFINITY; max_z = -Float::INFINITY

      i = 0
      while i < vertices_flat.length
        x = vertices_flat[i].to_f
        y = vertices_flat[i + 1].to_f
        z = vertices_flat[i + 2].to_f
        min_x = x if x < min_x
        min_y = y if y < min_y
        min_z = z if z < min_z
        max_x = x if x > max_x
        max_y = y if y > max_y
        max_z = z if z > max_z
        i += 3
      end

      # 박스 두께가 0이면 (평면 메시 등) 추가 안 함
      return 0 if (max_x - min_x).abs < 1e-6 && (max_y - min_y).abs < 1e-6
      return 0 if (max_y - min_y).abs < 1e-6 && (max_z - min_z).abs < 1e-6
      return 0 if (max_x - min_x).abs < 1e-6 && (max_z - min_z).abs < 1e-6

      # mm → inch 변환
      x0 = min_x * MM_TO_INCH; x1 = max_x * MM_TO_INCH
      y0 = min_y * MM_TO_INCH; y1 = max_y * MM_TO_INCH
      z0 = min_z * MM_TO_INCH; z1 = max_z * MM_TO_INCH

      # 박스 8개 꼭짓점
      p000 = Geom::Point3d.new(x0, y0, z0)
      p100 = Geom::Point3d.new(x1, y0, z0)
      p110 = Geom::Point3d.new(x1, y1, z0)
      p010 = Geom::Point3d.new(x0, y1, z0)
      p001 = Geom::Point3d.new(x0, y0, z1)
      p101 = Geom::Point3d.new(x1, y0, z1)
      p111 = Geom::Point3d.new(x1, y1, z1)
      p011 = Geom::Point3d.new(x0, y1, z1)

      material = make_material(color, opacity)

      # 박스 6면을 사각형 face로 추가
      faces = []
      faces << safe_add_face(entities, [p000, p100, p110, p010])  # bottom (-Z)
      faces << safe_add_face(entities, [p001, p011, p111, p101])  # top (+Z)
      faces << safe_add_face(entities, [p000, p001, p101, p100])  # front (-Y)
      faces << safe_add_face(entities, [p010, p110, p111, p011])  # back (+Y)
      faces << safe_add_face(entities, [p000, p010, p011, p001])  # left (-X)
      faces << safe_add_face(entities, [p100, p101, p111, p110])  # right (+X)

      faces.compact!
      faces.each do |face|
        face.material = material if material
        face.back_material = material if material
      end

      faces.length
    end

    def self.safe_add_face(entities, points)
      entities.add_face(*points)
    rescue ArgumentError
      nil
    end

    # 그룹/엔티티 안에서 양쪽에 면이 있고 두 면이 같은 평면(또는 거의 같은 법선)인
    # 가장자리를 hide + soft + smooth 처리.
    PLANAR_DOT_THRESHOLD = 0.9999  # cos(약 0.8°)

    def self.hide_coplanar_edges(entities)
      entities.grep(Sketchup::Edge).each do |edge|
        faces = edge.faces
        next unless faces.length == 2
        n1 = faces[0].normal
        n2 = faces[1].normal
        next if n1.length == 0 || n2.length == 0
        if n1.dot(n2).abs >= PLANAR_DOT_THRESHOLD
          # hidden만 true (soft/smooth는 그라데이션 셰이딩을 일으키므로 사용 안 함)
          edge.hidden = true
          edge.soft = false
          edge.smooth = false
        end
      end
    rescue StandardError => e
      warn "[tttcraft] hide_coplanar_edges error: #{e.message}"
    end

    def self.make_material(color, opacity)
      model = Sketchup.active_model
      r = (color['r'] || 200).to_i
      g = (color['g'] || 200).to_i
      b = (color['b'] || 200).to_i

      key = format('tttcraft_%02x%02x%02x_%03d', r, g, b, (opacity * 100).to_i)
      mat = model.materials[key]
      return mat if mat

      mat = model.materials.add(key)
      mat.color = Sketchup::Color.new(r, g, b)
      mat.alpha = opacity if opacity < 1.0
      mat
    end

    def self.degenerate_triangle?(a, b, c)
      ab = b - a
      ac = c - a
      cross = ab.cross(ac)
      cross.length < 1e-10
    end

    def self.notify(dialog, success, error_message = nil)
      return unless dialog && dialog.respond_to?(:execute_script)
      payload = { success: success ? true : false, error: error_message }
      js_payload = payload.to_json rescue '{"success":false}'
      dialog.execute_script("window.__sketchupImportDone && window.__sketchupImportDone(#{js_payload});")
    rescue StandardError => e
      warn "[tttcraft] notify error: #{e.message}"
    end
  end
end

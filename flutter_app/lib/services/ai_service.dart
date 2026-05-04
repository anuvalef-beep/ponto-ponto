import 'package:google_generative_ai/google_generative_ai.dart';
import '../signals/app_signals.dart';

class AIService {
  final String apiKey;
  late GenerativeModel _model;

  AIService({required this.apiKey}) {
    _model = GenerativeModel(
      model: 'gemini-1.5-flash',
      apiKey: apiKey,
    );
  }

  Future<String?> processCommand(String command) async {
    try {
      final content = [Content.text(command)];
      final response = await _model.generateContent(content);
      return response.text;
    } catch (e) {
      AppSignals.message.value = 'Erro na IA: $e';
      return null;
    }
  }
}

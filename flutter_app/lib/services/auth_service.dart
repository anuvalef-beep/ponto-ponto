import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import './database_service.dart';
import '../signals/app_signals.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

  AuthService() {
    // Listen to auth changes
    _auth.authStateChanges().listen((user) async {
      AppSignals.user.value = user;
      if (user != null) {
        final db = DatabaseService(uid: user.uid);
        final settings = await db.getSettings();
        if (settings != null) {
          AppSignals.settings.value = settings;
        }
      }
    });
  }

  Future<UserCredential?> signInWithGoogle() async {
    try {
      AppSignals.isLoading.value = true;
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return null;

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      final AuthCredential credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      return await _auth.signInWithCredential(credential);
    } catch (e) {
      AppSignals.message.value = 'Erro ao entrar com Google: $e';
      return null;
    } finally {
      AppSignals.isLoading.value = false;
    }
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
    await _auth.signOut();
  }
}

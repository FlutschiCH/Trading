import os
import ssl
from typing import Dict, Any

def get_ssl_config(cert_path: str = "cert.pem", key_path: str = "key.pem") -> Dict[str, Any]:
    """
    Checks if SSL certificate and key files exist.
    If they do, returns a dictionary containing ssl arguments for gevent.pywsgi.WSGIServer.
    Otherwise, returns an empty dictionary.
    """
    # Allow overriding paths via environment variables
    cert_file = os.environ.get("SSL_CERT_PATH", cert_path)
    key_file = os.environ.get("SSL_KEY_PATH", key_path)
    
    # Try absolute paths relative to backend directory if relative path fails
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    
    cert_abs = cert_file if os.path.isabs(cert_file) else os.path.join(backend_dir, cert_file)
    key_abs = key_file if os.path.isabs(key_file) else os.path.join(backend_dir, key_file)
    
    if os.path.exists(cert_abs) and os.path.exists(key_abs):
        print(f"SSL Config: Certificates found. Using cert: {cert_abs}, key: {key_abs}", flush=True)
        return {
            "keyfile": key_abs,
            "certfile": cert_abs
        }
    
    # Check if we should auto-generate self-signed certificates
    if os.environ.get("AUTO_GENERATE_SSL", "true").lower() == "true":
        try:
            from OpenSSL import crypto
            print("SSL Config: Generating self-signed SSL certificates...", flush=True)
            
            # create a key pair
            k = crypto.PKey()
            k.generate_key(crypto.TYPE_RSA, 2048)

            # create a self-signed cert
            cert = crypto.X509()
            cert.get_subject().C = "CH"
            cert.get_subject().ST = "Zurich"
            cert.get_subject().L = "Zurich"
            cert.get_subject().O = "Trading App"
            cert.get_subject().OU = "Trading App Dev"
            cert.get_subject().CN = "89.217.138.51"
            cert.set_serial_number(1000)
            cert.set_notBefore(b"20260101000000Z")
            cert.set_notAfter(b"20360101000000Z")
            cert.set_issuer(cert.get_subject())
            cert.set_pubkey(k)
            cert.sign(k, 'sha256')

            with open(cert_abs, "wb") as f:
                f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
            with open(key_abs, "wb") as f:
                f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
                
            print(f"SSL Config: Successfully generated certificates at {cert_abs} and {key_abs}", flush=True)
            return {
                "keyfile": key_abs,
                "certfile": cert_abs
            }
        except ImportError:
            print("SSL Config: PyOpenSSL package not installed. Cannot auto-generate certificates. Please run: pip install pyopenssl", flush=True)
        except Exception as e:
            print(f"SSL Config: Failed to auto-generate certificates: {e}", flush=True)
            
    print("SSL Config: Running in HTTP mode (No SSL certificates).", flush=True)
    return {}
